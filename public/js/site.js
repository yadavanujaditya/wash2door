'use strict';
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfg = null;
  var lang = document.documentElement.getAttribute('lang') === 'hi' ? 'hi' : 'en';

  // ---------- language ----------
  var HI = {
    'nav.how': 'कैसे काम करता है', 'nav.services': 'सेवाएँ', 'nav.track': 'ऑर्डर ट्रैक करें', 'nav.stays': 'होटल व कैंप', 'nav.book': 'पिकअप बुक करें',
    'hero.eyebrow': 'ऋषिकेश · पिकअप और डिलीवरी',
    'hero.h1': 'घाट से उठाया। <em>घर तक तह लगाकर पहुँचाया।</em>',
    'hero.sub': 'तपोवन, लक्ष्मण झूला और स्वर्गाश्रम की गलियाँ हम जानते हैं। मशीन वॉश, स्टीम प्रेस और ड्राई क्लीन। एक मिनट में बुक करें, कपड़े आने पर पैसे दें।',
    'hero.cta1': 'पिकअप बुक करें', 'hero.cta2': 'WhatsApp पर बात करें',
    'trust.free': 'पिकअप बड़े ऑर्डर पर', 'trust.express': 'एक्सप्रेस विकल्प', 'trust.pay': 'या डिलीवरी पर कैश',
    'how.eyebrow': 'कैसे काम करता है', 'how.title': 'चार कदम। न लाइन, न बैग उठाने का झंझट',
    'how.s1': 'बुक करें', 'how.s1p': 'सेवा और समय चुनिए। कन्फ़र्म करने से पहले दाम दिखता है।',
    'how.s2': 'हम लेने आते हैं', 'how.s2p': 'हमारा राइडर आपके ठिकाने से बैग लेता है, टैग लगाता है और नाज़ुक कपड़ों का नोट बनाता है।',
    'how.s3': 'धुलाई, प्रेस, फ़िनिश', 'how.s3p': 'हर ग्राहक के कपड़े अलग बैच में धुलते हैं, फिर प्रेस होकर टैग से मिलाए जाते हैं।',
    'how.s4': 'तह लगाकर डिलीवरी', 'how.s4p': 'आपके चुने समय पर दरवाज़े तक। UPI या कैश से तब भुगतान करें।',
    'svc.eyebrow': 'सेवाएँ और दाम', 'svc.title': 'साफ़ दाम, बुकिंग से पहले',
    'book.eyebrow': 'पिकअप बुक करें', 'book.title': 'बताइए क्या धोना है',
    'book.items': '1. क्या धोना है?', 'book.add': '+ एक और सेवा जोड़ें', 'book.express': 'एक्सप्रेस, 24 घंटे में वापस',
    'book.when': '2. हम कब आएँ?', 'book.date': 'पिकअप की तारीख', 'book.slot': 'पिकअप का समय',
    'book.where': '3. कहाँ और किसके पास?', 'book.name': 'आपका नाम', 'book.phone': 'मोबाइल नंबर', 'book.area': 'इलाका',
    'book.address': 'पूरा पता या लैंडमार्क', 'book.notes': 'कोई ख़ास बात? (वैकल्पिक)',
    'book.submit': 'पिकअप कन्फ़र्म करें', 'book.waonly': 'इसके बजाय WhatsApp पर भेजें',
    'book.sum': 'आपका अनुमान', 'book.total': 'कुल', 'book.paynote': 'डिलीवरी पर UPI या कैश से भुगतान करें। अंतिम वज़न पिकअप पर तय होगा।',
    'track.eyebrow': 'ऑर्डर ट्रैक करें', 'track.title': 'मेरे कपड़े कहाँ हैं?', 'track.code': 'ऑर्डर कोड', 'track.phone': 'मोबाइल के आख़िरी 4 अंक', 'track.go': 'स्थिति देखें',
    'stays.eyebrow': 'स्टे, हॉस्टल और कैंप के लिए', 'stays.title': 'आपके मेहमानों के कपड़े समय पर धुलें।',
    'stays.p': 'योग स्कूल, राफ्टिंग कैंप और हॉस्टल के लिए तय साप्ताहिक पिकअप, कमरे के हिसाब से टैग वाले बैग और महीने में एक बिल। कितने मेहमान हैं बताइए, हम रेट भेजेंगे।',
    'stays.cta': 'पार्टनर रेट पूछें',
    'areas.eyebrow': 'हम कहाँ आते हैं', 'areas.title': 'अपनी गली खोजिए', 'areas.q': 'अपना होटल, घाट या इलाका लिखिए',
    'faq.eyebrow': 'काम की बातें', 'faq.title': 'अक्सर पूछे जाने वाले सवाल',
  };
  function t(key, fallback) { return lang === 'hi' && HI[key] ? HI[key] : fallback; }
  $$('[data-i18n]').forEach(function (el) { el.dataset.en = el.textContent; });
  $$('[data-i18n-html]').forEach(function (el) { el.dataset.en = el.innerHTML; });
  function applyLang() {
    document.documentElement.setAttribute('lang', lang);
    $$('[data-i18n]').forEach(function (el) { el.textContent = lang === 'hi' && HI[el.dataset.i18n] ? HI[el.dataset.i18n] : el.dataset.en; });
    $$('[data-i18n-html]').forEach(function (el) { el.innerHTML = lang === 'hi' && HI[el.dataset.i18nHtml] ? HI[el.dataset.i18nHtml] : el.dataset.en; });
    var sw = $('#lang');
    $$('span', sw).forEach(function (s, i) { s.classList.toggle('on', (i === 1) === (lang === 'hi')); });
    sw.setAttribute('aria-label', lang === 'hi' ? 'Switch language to English' : 'हिंदी में बदलें');
    if (cfg) { renderSummary(); }
  }
  $('#lang').addEventListener('click', function () {
    lang = lang === 'hi' ? 'en' : 'hi';
    try { localStorage.setItem('ww_lang', lang); } catch (e) { /* ignore */ }
    applyLang();
  });

  // ---------- helpers ----------
  var money = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var unitLabel = function (u, q) { return u === 'kg' ? 'kg' : (q === 1 ? 'piece' : 'pieces'); };
  var istToday = function () { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); };
  function dateLabel(iso, i) {
    var d = new Date(iso + 'T00:00:00Z');
    var txt = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return i === 0 ? 'Today, ' + txt : i === 1 ? 'Tomorrow, ' + txt : txt;
  }
  function waUrl(text) { return 'https://wa.me/' + cfg.business.whatsapp + '?text=' + encodeURIComponent(text); }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // ---------- header, reveal, bubbles ----------
  var header = $('#top');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  $$('.sec-head, .svc, .step, .done, .summary, .faq details, .checks li').forEach(function (el) { el.classList.add('rv'); });
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }) : null;
  function watchReveal() { $$('.rv:not(.in)').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); }); }
  watchReveal();
  setTimeout(function () { $$('.rv:not(.in)').forEach(function (el) { el.classList.add('in'); }); }, 3500); // failsafe: never leave content hidden

  var bub = $('#bubbles');
  if (bub && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (var i = 0; i < 16; i++) {
      var b = document.createElement('span'), s = 6 + Math.random() * 18;
      b.style.cssText = 'left:' + (Math.random() * 100) + '%;width:' + s + 'px;height:' + s + 'px;animation-duration:' + (14 + Math.random() * 16) + 's;animation-delay:-' + (Math.random() * 24) + 's;--dx:' + ((Math.random() - .5) * 90) + 'px;opacity:' + (.35 + Math.random() * .5);
      bub.appendChild(b);
    }
  }

  // on narrow screens show the whole bridge instead of cropping to the middle
  var sceneSvg = $('.hero-scene svg');
  function fitScene() { if (sceneSvg) sceneSvg.setAttribute('preserveAspectRatio', window.innerWidth < 760 ? 'xMidYMax meet' : 'xMidYMax slice'); }
  fitScene(); window.addEventListener('resize', fitScene);

  // bridge suspenders along each cable curve
  (function () {
    var g = $('#suspenders'); if (!g) return;
    var NS = 'http://www.w3.org/2000/svg', out = '';
    function curve(p0, c, p1, from, to, n) {
      for (var k = 0; k <= n; k++) {
        var u = from + (to - from) * k / n, a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c2 = u * u;
        var x = a * p0[0] + b2 * c[0] + c2 * p1[0], y = a * p0[1] + b2 * c[1] + c2 * p1[1];
        out += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="548"/>';
      }
    }
    curve([323, 372], [800, 640], [1277, 372], 0.03, 0.97, 44);
    curve([0, 536], [150, 540], [323, 372], 0.08, 0.95, 10);
    curve([1277, 372], [1450, 540], [1600, 536], 0.05, 0.92, 10);
    g.innerHTML = out; void NS;
  })();

  // scroll drawn journey
  var journey = $('#journey');
  var steps = $$('.step', journey);
  function journeyTick() {
    var r = journey.getBoundingClientRect(), vh = window.innerHeight;
    var p = Math.max(0, Math.min(1, (vh * 0.78 - r.top) / (r.height + vh * 0.18)));
    journey.style.setProperty('--p', p.toFixed(3));
    steps.forEach(function (s, i) { s.classList.toggle('active', p >= i / steps.length + 0.02); });
  }
  var jt = false;
  window.addEventListener('scroll', function () { if (!jt) { jt = true; requestAnimationFrame(function () { jt = false; journeyTick(); }); } }, { passive: true });
  window.addEventListener('resize', journeyTick);
  journeyTick();

  // ---------- booking ----------
  var state = { lines: [{ service: 'wash_fold', qty: 3 }], express: false, quote: null };
  var linesEl = $('#lines');

  function svcById(id) { return cfg.services.find(function (s) { return s.id === id; }); }
  function stepFor(s) { return s.unit === 'kg' ? 0.5 : 1; }

  function quote() {
    var items = state.lines.map(function (l) { var s = svcById(l.service); return { s: s, qty: l.qty, amount: Math.round(l.qty * s.rate) }; });
    var sub = items.reduce(function (a, i) { return a + i.amount; }, 0);
    var topUp = sub < cfg.minOrder ? cfg.minOrder - sub : 0; sub += topUp;
    var exp = state.express ? Math.round(sub * cfg.expressPct / 100) : 0;
    var pickup = sub + exp >= cfg.freePickupAbove ? 0 : cfg.pickupFee;
    return { items: items, topUp: topUp, subtotal: sub, express: exp, pickup: pickup, total: sub + exp + pickup };
  }

  function renderLines() {
    var used = state.lines.map(function (l) { return l.service; });
    linesEl.innerHTML = '';
    state.lines.forEach(function (l, idx) {
      var s = svcById(l.service), row = document.createElement('div');
      row.className = 'line';
      var sel = document.createElement('select');
      sel.id = 'svc-' + idx; sel.setAttribute('aria-label', 'Service ' + (idx + 1));
      cfg.services.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.id; op.textContent = o.name + ' · ' + money(o.rate) + '/' + (o.unit === 'kg' ? 'kg' : 'piece');
        if (o.id !== l.service && used.indexOf(o.id) > -1) op.disabled = true;
        if (o.id === l.service) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () {
        var ns = svcById(sel.value);
        l.service = sel.value;
        l.qty = ns.unit === 'kg' ? Math.max(0.5, Math.round(l.qty * 2) / 2) : Math.max(1, Math.round(l.qty));
        renderLines(); renderSummary();
      });
      var st = document.createElement('div'); st.className = 'stepper';
      var minus = document.createElement('button'), out = document.createElement('output'), plus = document.createElement('button');
      minus.type = plus.type = 'button'; minus.textContent = '−'; plus.textContent = '+';
      minus.setAttribute('aria-label', 'Less'); plus.setAttribute('aria-label', 'More');
      out.textContent = l.qty + ' ' + unitLabel(s.unit, l.qty);
      function bump(d) {
        var step = stepFor(svcById(l.service)), min = step;
        l.qty = Math.min(60, Math.max(min, Math.round((l.qty + d * step) * 2) / 2));
        out.textContent = l.qty + ' ' + unitLabel(svcById(l.service).unit, l.qty);
        renderSummary();
      }
      minus.addEventListener('click', function () { bump(-1); });
      plus.addEventListener('click', function () { bump(1); });
      st.append(minus, out, plus);
      row.append(sel, st);
      if (state.lines.length > 1) {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove this service');
        x.addEventListener('click', function () { state.lines.splice(idx, 1); renderLines(); renderSummary(); });
        row.appendChild(x);
      }
      linesEl.appendChild(row);
    });
    $('#add-line').hidden = state.lines.length >= cfg.services.length;
  }

  var shownTotal = 0, raf = 0;
  function animateTotal(to) {
    cancelAnimationFrame(raf);
    var from = shownTotal, start = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    (function frame(now) {
      var k = dur ? Math.min(1, (now - start) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      shownTotal = Math.round(from + (to - from) * e);
      $('#sum-total').textContent = money(shownTotal);
      if (k < 1) raf = requestAnimationFrame(frame);
    })(start);
  }
  function renderSummary() {
    var q = state.quote = quote();
    $('#sum-lines').innerHTML = q.items.map(function (i) {
      return '<li><span>' + esc(i.s.name) + '<small>' + i.qty + ' ' + unitLabel(i.s.unit, i.qty) + ' × ' + money(i.s.rate) + '</small></span><span>' + money(i.amount) + '</span></li>';
    }).join('');
    var rows = '';
    if (q.topUp) rows += '<div><dt>Minimum order top-up</dt><dd>' + money(q.topUp) + '</dd></div>';
    if (q.express) rows += '<div><dt>Express (+' + cfg.expressPct + '%)</dt><dd>' + money(q.express) + '</dd></div>';
    rows += '<div><dt>Pickup and delivery</dt><dd>' + (q.pickup ? money(q.pickup) : 'Free') + '</dd></div>';
    $('#sum-rows').innerHTML = rows;
    animateTotal(q.total);
  }

  function fillSelects() {
    var dd = $('#pickupDate'), today = istToday();
    dd.innerHTML = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(Date.parse(today + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
      var o = document.createElement('option'); o.value = d; o.textContent = dateLabel(d, i); dd.appendChild(o);
    }
    $('#slot').innerHTML = cfg.slots.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    $('#area').innerHTML = '<option value="">Choose your area</option>' + cfg.areas.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('');
  }

  function invalid(el, on) { if (el) el.setAttribute('aria-invalid', on ? 'true' : 'false'); }
  function showError(msg) { var e = $('#form-error'); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  function readForm() {
    return {
      name: $('#name').value.trim(), phone: $('#phone').value.trim(), area: $('#area').value, address: $('#address').value.trim(),
      notes: $('#notes').value.trim(), slot: $('#slot').value, pickup_date: $('#pickupDate').value, express: state.express,
      items: state.lines.map(function (l) { return { service: l.service, qty: l.qty }; }), website: $('#website').value,
    };
  }
  function validate(f) {
    var digits = f.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
    var bad = [];
    if (!f.name) bad.push($('#name'));
    if (!/^[6-9]\d{9}$/.test(digits)) bad.push($('#phone'));
    if (!f.address) bad.push($('#address'));
    ['name', 'phone', 'address'].forEach(function (id) { invalid($('#' + id), bad.indexOf($('#' + id)) > -1); });
    if (bad.length) { bad[0].focus(); return 'Please fill your name, a 10 digit mobile number and your address.'; }
    return '';
  }
  function message(f, code) {
    var q = state.quote, when = $('#pickupDate').selectedOptions[0].textContent;
    return ['Hello Wash Wala! I would like a laundry pickup.', code ? 'Order code: ' + code : '', 'Name: ' + f.name, 'Phone: ' + f.phone,
      'Area: ' + (f.area || '-'), 'Address: ' + f.address,
      'Items: ' + q.items.map(function (i) { return i.s.name + ' ' + i.qty + ' ' + unitLabel(i.s.unit, i.qty); }).join(', '),
      'Express: ' + (f.express ? 'Yes' : 'No'), 'Pickup: ' + when + ', ' + f.slot, 'Estimate: ' + money(q.total), f.notes ? 'Notes: ' + f.notes : ''].filter(Boolean).join('\n');
  }

  $('#add-line').addEventListener('click', function () {
    var used = state.lines.map(function (l) { return l.service; });
    var next = cfg.services.find(function (s) { return used.indexOf(s.id) === -1; });
    if (!next) return;
    state.lines.push({ service: next.id, qty: next.unit === 'kg' ? 2 : 1 });
    renderLines(); renderSummary();
  });
  $('#express').addEventListener('change', function (e) { state.express = e.target.checked; renderSummary(); });
  $('#wa-only').addEventListener('click', function () {
    var f = readForm(), err = validate(f); showError(err); if (err) return;
    window.open(waUrl(message(f)), '_blank', 'noopener');
  });
  $('#order-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = readForm(), err = validate(f); showError(err); if (err) return;
    var btn = $('#submit'); btn.disabled = true; var label = btn.textContent; btn.textContent = 'Booking…';
    api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      .then(function (res) {
        if (!res.code) throw new Error('Could not confirm the booking. Please try WhatsApp.');
        $('#done-name').textContent = f.name.split(' ')[0];
        $('#done-code').textContent = res.code;
        var f2 = Object.assign({}, f);
        $('#done-wa').href = waUrl(message(f2, res.code));
        $('#done-track').onclick = function () {
          $('#t-code').value = res.code; $('#t-phone').value = f.phone.replace(/\D/g, '').slice(-4);
          setTimeout(function () { $('#track-form').requestSubmit(); }, 300);
        };
        $('#done').hidden = false; $('.book').classList.add('is-done');
        $('#done').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('#done').classList.add('in');
      })
      .catch(function (e) { showError(e.message + (e.status ? '' : ' You can also tap "Send on WhatsApp instead".')); })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  });
  $('#done-again').addEventListener('click', function () {
    $('#done').hidden = true; $('.book').classList.remove('is-done');
    ['name', 'phone', 'address', 'notes'].forEach(function (id) { $('#' + id).value = ''; });
    $('#book').scrollIntoView({ behavior: 'smooth' });
  });

  // ---------- tracker ----------
  var FLOW = ['new', 'confirmed', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'];
  var LABEL = { new: 'Order received', confirmed: 'Pickup confirmed', picked_up: 'Picked up', processing: 'Being washed and pressed', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
  $('#track-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = $('#track-error'), res = $('#track-result'); err.hidden = true;
    api('/api/track?code=' + encodeURIComponent($('#t-code').value.trim()) + '&phone=' + encodeURIComponent($('#t-phone').value.trim()))
      .then(function (o) {
        $('#tr-code').textContent = o.code + ' · for ' + o.first_name;
        $('#tr-label').textContent = o.status === 'cancelled' ? 'Cancelled' : o.label;
        $('#tr-bal').textContent = o.status === 'cancelled' ? '' : (o.balance > 0 ? money(o.balance) + ' to pay on delivery' : 'Paid in full');
        var at = {}; o.events.forEach(function (e) { at[e.status] = e.at; });
        var cur = FLOW.indexOf(o.status);
        $('#tr-line').innerHTML = o.status === 'cancelled' ? '<li class="done-s"><b>Order cancelled</b></li>' : FLOW.map(function (s, i) {
          var cls = i < cur ? 'done-s' : i === cur ? 'done-s now' : '';
          var when = at[s] ? '<small>' + new Date(at[s]).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '</small>' : '';
          return '<li class="' + cls + '"><b>' + esc(LABEL[s]) + '</b>' + when + '</li>';
        }).join('');
        $('#tr-items').textContent = o.items.map(function (i) { return i.name + ' ' + i.qty + ' ' + unitLabel(i.unit, i.qty); }).join(' · ') + ' · Total ' + money(o.total);
        res.hidden = false;
      })
      .catch(function (e) { res.hidden = true; err.textContent = e.message; err.hidden = false; });
  });

  // ---------- areas, services, faq numbers, reviews ----------
  function renderAreas() {
    var chips = $('#area-chips');
    var list = cfg.areas.filter(function (a) { return !/^other/i.test(a); });
    chips.innerHTML = list.map(function (a) { return '<li data-a="' + esc(a.toLowerCase()) + '">' + esc(a) + '</li>'; }).join('');
    $('#area-q').addEventListener('input', function (e) {
      var q = e.target.value.trim().toLowerCase(), hit = null;
      $$('li', chips).forEach(function (li) { var m = q && (li.dataset.a.indexOf(q) > -1 || q.indexOf(li.dataset.a.split(' (')[0]) > -1); li.classList.toggle('hit', !!m); if (m && !hit) hit = li.textContent; });
      $('#area-answer').textContent = !q ? '' : hit ? 'Yes, we pick up in ' + hit + '.' : 'Not on our list yet. Message us on WhatsApp and we will check if a rider can reach you.';
    });
  }
  function renderServices() {
    $('#svc-grid').innerHTML = cfg.services.map(function (s) {
      return '<article class="svc"><h3>' + esc(s.name) + '</h3><div class="rate">' + money(s.rate) + '<small>per ' + (s.unit === 'kg' ? 'kg' : 'piece') + '</small></div><p>' + esc(s.desc) + '</p><span class="tat">' + esc(s.tat) + '</span><a class="link-btn pick" href="#book" data-pick="' + esc(s.id) + '">Book this</a></article>';
    }).join('');
    $$('.svc').forEach(function (el) { el.classList.add('rv'); }); watchReveal();
    $$('[data-pick]').forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.dataset.pick;
        if (!state.lines.some(function (l) { return l.service === id; })) {
          var s = svcById(id); var first = state.lines[0];
          if (state.lines.length === 1 && first.qty === 3 && first.service === 'wash_fold') { first.service = id; first.qty = s.unit === 'kg' ? 3 : 1; }
          else state.lines.push({ service: id, qty: s.unit === 'kg' ? 3 : 1 });
          renderLines(); renderSummary();
        }
      });
    });
    $('#svc-note').textContent = 'Minimum order ' + money(cfg.minOrder) + '. Pickup and delivery are free from ' + money(cfg.freePickupAbove) + ', otherwise ' + money(cfg.pickupFee) + '. Express adds ' + cfg.expressPct + '%.';
  }

  function init(c) {
    cfg = c;
    $$('[data-wa]').forEach(function (a) { a.href = waUrl(a.dataset.wa); });
    $$('[data-cfg]').forEach(function (el) { var v = cfg[el.dataset.cfg]; el.textContent = el.hasAttribute('data-money') ? money(v) : v; });
    var b = cfg.business;
    var tel = 'tel:+' + b.whatsapp;
    $('#f-phone').textContent = b.phone; $('#f-phone').href = tel; $('#dock-call').href = tel;
    $('#f-hours').textContent = b.hours; $('#f-addr').textContent = b.address;
    $('#express-note').textContent = '+' + cfg.expressPct + '% on the order';
    $('#t-free').textContent = 'Free';
    fillSelects(); renderServices(); renderAreas(); renderLines(); renderSummary(); applyLang();
  }

  $('#yr').textContent = new Date().getFullYear();
  api('/api/config').then(init).catch(function () {
    $('#svc-grid').innerHTML = '<p class="muted">Prices could not load. Please WhatsApp us and we will reply with rates.</p>';
  });

  fetch('/reviews.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (rev) {
    if (!Array.isArray(rev) || !rev.length) return;
    $('#rev-grid').innerHTML = rev.slice(0, 6).map(function (r) {
      return '<figure class="rev rv"><blockquote>“' + esc(r.text) + '”</blockquote><cite>' + esc(r.name) + (r.where ? ', ' + esc(r.where) : '') + '</cite></figure>';
    }).join('');
    $('#reviews').hidden = false; watchReveal();
  }).catch(function () { /* no reviews yet */ });
})();
