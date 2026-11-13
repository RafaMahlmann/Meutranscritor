/* Medição das páginas internas da landing — sem cookie e sem código de terceiros.
   É o mesmo aviso da landing/index.html (ver lá o comentário completo): conta
   "alguém abriu a página" e "alguém clicou em Start for free / Subscribe", só
   em totais por dia, pela ponte do Vox. Explicado na Política de Privacidade
   (Analytics and tracking). Se a landing mudar esse trecho, mudar aqui também. */
(function () {
    var PONTE = 'https://vox-ponte.flordeplasma.workers.dev';
    /* Teste local contra um `wrangler dev`: só vale em localhost. */
    try {
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
            var t = localStorage.getItem('vox_ponte_teste');
            if (t) PONTE = t.replace(/\/+$/, '');
        }
    } catch (e) {}
    function avisa(o) {
        try { navigator.sendBeacon(PONTE + '/v1/landing/evento', JSON.stringify(o)); } catch (e) {}
    }
    var origem = 'direto';
    try {
        var q = new URLSearchParams(location.search);
        var ref = document.referrer ? new URL(document.referrer).hostname : '';
        if (/(^|\.)voxcharmai\.com$/.test(ref)) ref = '';
        origem = q.get('utm_source') || ref || 'direto';
    } catch (e) {}
    avisa({ tipo: 'visita', origem: origem });
    /* Repassa a origem pro app (doc 33, L3.8): quem chegou aqui com
       ?utm_source=<canal> leva o mesmo canal no link do app; quem chegou sem
       nada leva "landing". O app só guarda canal de uma lista fechada e só
       conta se a pessoa aceitar a contagem (ver Privacidade). */
    try {
        var canal = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase();
        if (!/^[a-z0-9-]{1,30}$/.test(canal)) canal = 'landing';
        Array.prototype.forEach.call(document.querySelectorAll('a[href*="app.voxcharmai.com"]'), function (a) {
            var h = a.getAttribute('href') || '';
            if (/terms|privacy/.test(h) || /[?&]utm_source=/.test(h)) return;
            a.setAttribute('href', h + (h.indexOf('?') > -1 ? '&' : '?') + 'utm_source=' + canal);
        });
    } catch (e) {}
    function avisaEVai(o, destino) {
        var foi = false;
        function vai() { if (!foi) { foi = true; location.href = destino; } }
        try {
            fetch(PONTE + '/v1/landing/evento', { method: 'POST', body: JSON.stringify(o), keepalive: true, mode: 'no-cors' }).then(vai, vai);
        } catch (e) { vai(); }
        setTimeout(vai, 400);
    }
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        var h = a.getAttribute('href') || '';
        var alvo = h.indexOf('checkout.freemius.com') > -1 ? 'assinar'
            : (h.indexOf('app.voxcharmai.com') > -1 && !/terms|privacy/.test(h)) ? 'gratis' : '';
        if (!alvo) return;
        var mesmaAba = e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (!a.target || a.target === '_self');
        if (!mesmaAba) { avisa({ tipo: 'clique', alvo: alvo }); return; }
        e.preventDefault();
        avisaEVai({ tipo: 'clique', alvo: alvo }, a.href);
    }, true);
})();
