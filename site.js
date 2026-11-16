(function () {
  'use strict';
  function init() {
    var nav = document.getElementById('nav');
    if (nav) {
      window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 60);
      }, { passive: true });
    }

    var burger = document.getElementById('nav-burger');
    var navLinks = document.querySelector('.nav-links');
    if (burger && navLinks) {
      burger.addEventListener('click', function () {
        burger.classList.toggle('open');
        navLinks.classList.toggle('open');
        burger.setAttribute('aria-label', navLinks.classList.contains('open') ? 'Menü schließen' : 'Menü öffnen');
      });
      navLinks.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          burger.classList.remove('open');
          navLinks.classList.remove('open');
          burger.setAttribute('aria-label', 'Menü öffnen');
        });
      });
    }

    function loadBgImages() {
      document.querySelectorAll('[data-src]').forEach(function (el) {
        var src = el.dataset.src;
        if (!src) return;
        var img = new Image();
        img.onload = function () {
          el.style.backgroundImage = "url('" + src + "')";
          el.dataset.loaded = '';
        };
        img.src = src;
      });
    }
    if ('requestIdleCallback' in window) requestIdleCallback(loadBgImages);
    else window.addEventListener('load', loadBgImages);

    var reveals = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (e.isIntersecting) {
          setTimeout(function () { e.target.classList.add('visible'); }, i * 75);
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(function (el) { observer.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
