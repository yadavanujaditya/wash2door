// Runs before first paint: marks JS as available and restores the saved language.
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  try {
    var l = localStorage.getItem('ww_lang');
    if (l === 'hi') d.setAttribute('lang', 'hi');
  } catch (e) { /* storage blocked, default to English */ }
})();
