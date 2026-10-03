'use strict';

const menuButton = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
if (menuButton && mainNav) {
  const closeMenu = () => {
    menuButton.setAttribute('aria-expanded', 'false');
    mainNav.classList.remove('is-open');
  };
  menuButton.addEventListener('click', () => {
    const willOpen = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(willOpen));
    mainNav.classList.toggle('is-open', willOpen);
  });
  mainNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });
  window.matchMedia('(min-width: 801px)').addEventListener('change', closeMenu);
}

const roomTabs = Array.from(document.querySelectorAll('[role="tab"]'));
const activateRoom = (tab, moveFocus) => {
  roomTabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  });
  if (moveFocus) tab.focus();
};
roomTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateRoom(tab, false));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % roomTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + roomTabs.length) % roomTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = roomTabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activateRoom(roomTabs[next], true);
    }
  });
});

const interestForm = document.getElementById('interest-form');
if (interestForm) {
  const emailAddress = 'nick@modernapexstrategies.com';
  const status = document.getElementById('form-status');
  const fallback = document.getElementById('email-fallback');
  const copyField = document.getElementById('email-copy');
  const copyButton = document.getElementById('copy-email');
  interestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!interestForm.reportValidity()) return;
    const data = new FormData(interestForm);
    const lines = [
      'Hi Nick,',
      '',
      "I'm interested in the Late Company concept.",
      '',
      'First name: ' + (String(data.get('name') || '').trim() || 'Not provided'),
      'Preferred area: ' + String(data.get('area') || '').trim(),
      'What would bring me in: ' + String(data.get('use') || ''),
      'Usual time: ' + String(data.get('hours') || ''),
      '',
      'A little more: ' + (String(data.get('note') || '').trim() || 'Nothing else for now.'),
      '',
      "I understand this is a concept in development, with no opening date or reservation."
    ];
    const body = lines.join('\n');
    const subject = 'Late Company interest';
    copyField.value = 'To: ' + emailAddress + '\nSubject: ' + subject + '\n\n' + body;
    fallback.hidden = false;
    status.hidden = false;
    status.textContent = 'Your email draft is ready. Finish sending it in your email app. If no app opens, use the message below. Nothing has been sent by this page.';
    const mailto = 'mailto:' + emailAddress + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.location.href = mailto;
  });
  document.getElementById('interest-submit').disabled = false;
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyField.value);
      copyButton.textContent = 'Message copied';
    } catch {
      copyField.focus();
      copyField.select();
      copyButton.textContent = 'Select and copy the message above';
    }
  });
}
