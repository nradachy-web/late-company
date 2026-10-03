import fs from "node:fs/promises";

const model = JSON.parse(await fs.readFile(new URL("./economics.json", import.meta.url), "utf8"));
const errors = [];
let checks = 0;
const near = (actual, expected, label) => {
  checks++;
  if (typeof actual !== "number" || !Number.isFinite(actual) || Math.abs(actual - expected) > 0.00001) errors.push({ label, actual, expected });
};
const equal = (actual, expected, label) => {
  checks++;
  if (actual !== expected) errors.push({ label, actual, expected });
};
const weeksPerMonth = model.calendar.weeks_per_year / model.calendar.months_per_year;
const days = model.calendar.days_per_month;
const fixedReference = Object.values(model.fixed_costs_monthly).reduce((sum, value) => sum + value, 0);
const passPrice = model.pricing.four_hour_pass * model.pricing.pass_mix_four_hour + model.pricing.eight_hour_pass * model.pricing.pass_mix_eight_hour;
near(passPrice, model.pricing.average_realized_pass_price, "weighted pass price");
const labor = model.labor;
near(
  model.fixed_costs_monthly.labor,
  (labor.total_host_hours_per_week * labor.host_hourly_wage +
    labor.weekly_overnight_premium_hours * labor.overnight_hourly_premium +
    labor.cleaner_hours_per_week * labor.cleaner_hourly_wage +
    labor.manager_nonfloor_hours_per_week * labor.manager_hourly_wage) *
    weeksPerMonth * (1 + labor.payroll_burden),
  "full reference labor"
);
near(labor.total_paid_hours_per_week, labor.total_host_hours_per_week + labor.cleaner_hours_per_week + labor.manager_nonfloor_hours_per_week, "full paid hours");
near(labor.total_host_hours_per_week, labor.weekly_primary_host_hours + labor.weekly_second_host_hours + labor.weekly_handoff_hours, "full host hours");
for (const level of ["low", "base", "high"]) {
  const subtotal = model.startup_lines.reduce((sum, line) => sum + line[level], 0);
  near(model.startup_totals[level].subtotal, subtotal, level + " startup subtotal");
  near(model.startup_totals[level].total, subtotal * (1 + model.startup_contingency_percent), level + " startup with contingency");
}

const summaries = [];
for (const format of model.operating_models) {
  const full = format.id === "fully_staffed_24h";
  let fixed = fixedReference;
  if (!full) {
    const payroll = (format.total_host_hours_per_week * labor.host_hourly_wage +
      format.weekly_overnight_premium_hours * labor.overnight_hourly_premium +
      format.cleaner_hours_per_week * labor.cleaner_hourly_wage +
      format.manager_nonfloor_hours_per_week * labor.manager_hourly_wage) *
      weeksPerMonth * (1 + labor.payroll_burden);
    near(format.base_labor_monthly, payroll, format.id + " payroll");
    near(format.total_paid_hours_per_week, format.total_host_hours_per_week + format.cleaner_hours_per_week + format.manager_nonfloor_hours_per_week, format.id + " paid hours");
    near(format.total_host_hours_per_week, format.weekly_primary_host_hours + format.weekly_second_host_hours + format.weekly_handoff_hours, format.id + " host hours");
    near(format.forty_hour_equivalents, format.total_paid_hours_per_week / 40, format.id + " FTE");
    fixed = fixedReference - model.fixed_costs_monthly.labor + payroll + format.oncall_response_monthly + format.incremental_access_software_monthly;
  }
  for (const scenario of format.scenarios) {
    const label = format.id + "/" + scenario.name;
    const monthlyFixed = fixed + scenario.extra_host_hours_weekly * labor.host_hourly_wage * weeksPerMonth * (1 + labor.payroll_burden);
    const arpu = model.pricing.six_visit_evening_membership_monthly * (1 - scenario.all_hours_member_share) +
      model.pricing.twelve_visit_all_hours_membership_monthly * scenario.all_hours_member_share;
    const unit = (members, passes) => {
      const memberRevenue = members * arpu;
      const passRevenue = passes * passPrice;
      const visits = members * scenario.member_visits_per_month + passes;
      const foodOrders = visits * scenario.food_attach_rate;
      const foodRevenue = foodOrders * scenario.food_ticket;
      const revenue = memberRevenue + passRevenue + foodRevenue;
      const foodCost = foodRevenue * (scenario.food_cogs + scenario.food_shrink_and_spoilage);
      const fees = revenue * model.merchant_fee.percent +
        (members + passes + foodOrders) * model.merchant_fee.per_transaction;
      return { memberRevenue, passRevenue, visits, foodOrders, foodRevenue, revenue, foodCost, fees, contribution: revenue - foodCost - fees };
    };
    let cumulative = 0;
    let lowest = 0;
    let annualRevenue = 0;
    let grossNewMembers = 0;
    let firstPositive = null;
    equal(scenario.monthly.length, 12, label + " month count");
    for (const [index, row] of scenario.monthly.entries()) {
      const members = scenario.members[index];
      const passes = scenario.passes[index];
      const values = unit(members, passes);
      const operating = values.contribution - monthlyFixed;
      const seats = values.visits * model.site.average_dwell_hours;
      const peak = seats * scenario.peak_seat_hour_share / (model.site.seats * model.site.peak_window_hours_per_day * days);
      near(row.membership_revenue, values.memberRevenue, label + " member revenue " + row.month);
      near(row.pass_revenue, values.passRevenue, label + " pass revenue " + row.month);
      near(row.total_visits, values.visits, label + " visits " + row.month);
      near(row.food_orders, values.foodOrders, label + " food orders " + row.month);
      near(row.food_revenue, values.foodRevenue, label + " food revenue " + row.month);
      near(row.total_revenue, values.revenue, label + " revenue " + row.month);
      near(row.food_cost_including_loss, values.foodCost, label + " food cost " + row.month);
      near(row.merchant_fees, values.fees, label + " fees " + row.month);
      near(row.fixed_cost, monthlyFixed, label + " fixed " + row.month);
      near(row.operating_cash_contribution, operating, label + " cash " + row.month);
      near(row.seat_hours, seats, label + " seat hours " + row.month);
      near(row.peak_occupancy, peak, label + " peak " + row.month);
      near(row.quiet_peak_occupancy, seats * scenario.peak_seat_hour_share * model.site.peak_quiet_share / (model.site.quiet_seats * model.site.peak_window_hours_per_day * days), label + " quiet peak " + row.month);
      equal(row.practical_peak_capacity_ok, peak <= model.site.practical_peak_occupancy_ceiling, label + " capacity flag " + row.month);
      cumulative += operating;
      lowest = Math.min(lowest, cumulative);
      annualRevenue += values.revenue;
      const previous = index === 0 ? scenario.opening_members : scenario.members[index - 1];
      const acquisition = Math.max(0, members - previous * (1 - scenario.churn_rate));
      near(row.expected_new_members_to_achieve_net_growth, acquisition, label + " acquisition " + row.month);
      grossNewMembers += acquisition;
      near(row.cumulative_operating_cash, cumulative, label + " cumulative " + row.month);
      if (firstPositive === null && operating >= 0) firstPositive = index + 1;
    }
    near(scenario.year_one.total_revenue, annualRevenue, label + " annual revenue");
    near(scenario.year_one.operating_cash_contribution, cumulative, label + " annual cash");
    near(scenario.year_one.maximum_cumulative_cash_deficit, -lowest, label + " peak deficit");
    near(scenario.year_one.expected_gross_new_members, grossNewMembers, label + " annual acquisition");
    equal(scenario.year_one.first_operating_breakeven_month, firstPositive, label + " first positive month");
    const memberContribution = unit(1, 0).contribution;
    const passContribution = unit(0, 1).contribution;
    near(scenario.unit_economics.member_contribution_per_month, memberContribution, label + " member contribution");
    near(scenario.unit_economics.pass_contribution_per_visit, passContribution, label + " pass contribution");
    const maturePasses = scenario.passes[11];
    const matureMembers = scenario.members[11];
    equal(scenario.break_even.members_at_mature_pass_demand, Math.ceil((monthlyFixed - maturePasses * passContribution) / memberContribution), label + " break-even members");
    equal(scenario.break_even.passes_at_mature_members, Math.max(0, Math.ceil((monthlyFixed - matureMembers * memberContribution) / passContribution)), label + " break-even passes");
    equal(scenario.break_even.members_with_no_passes, Math.ceil(monthlyFixed / memberContribution), label + " member-only break-even");
    const reserve = monthlyFixed * model.liquidity_reserve_months_fixed_cost;
    near(scenario.capital.liquidity_reserve, reserve, label + " reserve");
    near(scenario.capital.year_one_operating_cash_deficit, -lowest, label + " capital deficit");
    for (const level of ["low", "base", "high"]) {
      const startup = model.startup_totals[level].total + (full ? 0 : format.incremental_capital_before_contingency[level] * (1 + model.startup_contingency_percent));
      near(scenario.capital["total_capital_at_" + level + "_startup"], startup - lowest + reserve, label + " capital " + level);
    }
    const fullMemberVisits = 6 * (1 - scenario.all_hours_member_share) + 12 * scenario.all_hours_member_share;
    const fullPassDuration = 4 * model.pricing.pass_mix_four_hour + 8 * model.pricing.pass_mix_eight_hour;
    const stressHours = matureMembers * fullMemberVisits * 4 + maturePasses * fullPassDuration;
    const stressPeak = stressHours * scenario.peak_seat_hour_share / (model.site.seats * model.site.peak_window_hours_per_day * days);
    near(scenario.capacity_stress.month_twelve_seat_hours, stressHours, label + " stress seat hours");
    near(scenario.capacity_stress.month_twelve_peak_occupancy, stressPeak, label + " stress peak");
    equal(scenario.capacity_stress.practical_peak_capacity_ok, stressPeak <= model.site.practical_peak_occupancy_ceiling, label + " stress capacity flag");
    summaries.push({ format: format.id, scenario: scenario.name, yearOneOperatingCash: Math.round(cumulative), capitalBase: Math.round(scenario.capital.total_capital_at_base_startup), stressPeak: Math.round(stressPeak * 1000) / 10 });
  }
}
const pilot = model.pilot;
near(pilot.revenue, pilot.events * pilot.average_paid_visitors_per_event * pilot.ticket_price, "pilot revenue");
near(pilot.total_cash_outlay, pilot.events * pilot.cost_per_event_before_fees + pilot.payment_fees + pilot.reusable_setup + pilot.contingency, "pilot outlay");
near(pilot.net_cash_cost, pilot.total_cash_outlay - pilot.revenue, "pilot net cost");
equal(model.canvas.length, 9, "canvas blocks");
equal(model.operating_models.reduce((n, format) => n + format.scenarios.reduce((sum, s) => sum + s.monthly.length, 0), 0), 108, "all monthly rows");
equal(/[\u2013\u2014]/.test(JSON.stringify(model)), false, "forbidden dash scan");
const report = { passed: errors.length === 0, checks, errors, summaries };
console.log(JSON.stringify(report, null, 2));
if (errors.length) throw new Error("Model verification failed");

