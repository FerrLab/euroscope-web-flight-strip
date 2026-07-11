export function setThemePrePaint(): string {
  return `
(function() {
  try {
    var m = document.cookie.match(/(?:^|; )eurostrip_theme=([^;]+)/);
    var theme = m ? decodeURIComponent(m[1]) : 'day';
    if (!['day','dusk','night','bright'].includes(theme)) theme = 'day';
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;
}
