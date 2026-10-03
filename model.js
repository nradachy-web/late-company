
(() => {
  const data = JSON.parse(document.getElementById('model-data').textContent);
  const formatInput = document.getElementById('format-select');
  const scenarioInput = document.getElementById('scenario-select');
  const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const percent = n => (n * 100).toFixed(1) + '%';
  const write = (id, value) => { document.getElementById(id).textContent = value; };
  function render() {
    const format = data.operating_models.find(x => x.id === formatInput.value);
    const scenario = format.scenarios.find(x => x.name === scenarioInput.value);
    write('format-status', format.status);
    write('metric-revenue', usd(scenario.year_one.total_revenue));
    write('metric-cash', usd(scenario.year_one.operating_cash_contribution));
    write('metric-capital', usd(scenario.capital.total_capital_at_base_startup));
    write('metric-fixed', usd(scenario.month_twelve.fixed_cost));
    const stress = scenario.capacity_stress;
    write('capacity-note', 'Month 12 evening peak: ' + percent(scenario.month_twelve.peak_occupancy) + ' at assumed use; ' + percent(stress.month_twelve_peak_occupancy) + ' if all included visits and pass durations are redeemed. Practical ceiling: ' + percent(data.site.practical_peak_occupancy_ceiling) + '. ' + (stress.practical_peak_capacity_ok ? 'Still monitor each zone and actual peak hours.' : 'Full redemption exceeds the practical ceiling. Reservations and measured use must limit sales.'));
    write('breakeven-note', 'At this mix, operating break-even is ' + scenario.break_even.members_at_mature_pass_demand + ' members plus ' + scenario.month_twelve.pass_visits.toFixed(0) + ' monthly pass visits. First positive month in this ramp: ' + (scenario.year_one.first_operating_breakeven_month || 'none in year one') + '. Capital range as buildout changes: ' + usd(scenario.capital.total_capital_at_low_startup) + ' to ' + usd(scenario.capital.total_capital_at_high_startup) + '.');
    const body = document.getElementById('model-months');
    body.replaceChildren();
    for (const month of scenario.monthly) {
      const tr = document.createElement('tr');
      const values = [month.month, month.active_members.toFixed(0), month.pass_visits.toFixed(0), usd(month.total_revenue), usd(month.fixed_cost), usd(month.operating_cash_contribution), usd(month.cumulative_operating_cash)];
      values.forEach((value, i) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (i) td.classList.add('numeric');
        if (i === 5) td.classList.add(month.operating_cash_contribution >= 0 ? 'positive' : 'negative');
        tr.append(td);
      });
      body.append(tr);
    }
  }
  formatInput.addEventListener('change', render);
  scenarioInput.addEventListener('change', render);
  render();
  formatInput.disabled = false;
  scenarioInput.disabled = false;
})();
