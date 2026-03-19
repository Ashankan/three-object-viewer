/**
 * Road Block — Frontend Scrubber
 *
 * Injects the playhead scrubber into the 3OV environment viewport.
 * Fires road-block:seek events that EnvironmentFront listens for.
 * Does NOT create a renderer — RoadMesh lives inside the R3F Canvas.
 */
(function () {
    'use strict';

    function formatTime(s) {
        var m = Math.floor(s / 60);
        var sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function getDuration() {
        var el = document.querySelector('.road-block-duration');
        return el ? parseFloat(el.textContent) || 60 : 60;
    }

    function injectScrubber(envWrap, duration) {
        var old = envWrap.querySelector('.road-block-scrubber');
        if (old) old.remove();

        var bar = document.createElement('div');
        bar.className = 'road-block-scrubber';
        bar.style.cssText = [
            'position:absolute', 'bottom:0', 'left:0', 'right:0', 'z-index:20',
            'background:linear-gradient(transparent,rgba(0,0,0,0.75))',
            'padding:22px 16px 10px',
            'display:flex', 'align-items:center', 'gap:10px',
            'pointer-events:auto'
        ].join(';');

        var lbl = document.createElement('span');
        lbl.style.cssText = 'color:rgba(255,255,255,0.55);font-size:11px;font-family:monospace;min-width:90px;white-space:nowrap';
        lbl.textContent = '0:00 / ' + formatTime(duration);

        var input = document.createElement('input');
        input.type  = 'range';
        input.min   = '0';
        input.max   = '1';
        input.step  = '0.0001';
        input.value = '0';
        input.style.cssText = 'flex:1;cursor:pointer;accent-color:#e8593c';

        bar.appendChild(lbl);
        bar.appendChild(input);

        if (getComputedStyle(envWrap).position === 'static') {
            envWrap.style.position = 'relative';
        }
        envWrap.appendChild(bar);

        input.addEventListener('input', function () {
            var t = parseFloat(input.value);
            lbl.textContent = formatTime(t * duration) + ' / ' + formatTime(duration);
            document.dispatchEvent(new CustomEvent('road-block:seek', { detail: { t: t } }));
        });

        return { input: input, label: lbl };
    }

    function boot() {
        var roadEl = document.querySelector('.three-object-three-app-road-block');
        if (!roadEl) return;

        var envWrap = document.querySelector('.three-object-three-app-environment');
        if (!envWrap) return;

        var duration = getDuration();
        var scrubber = injectScrubber(envWrap, duration);

        function syncFromAudio(currentTime, dur) {
            var t = Math.min(currentTime / dur, 1);
            scrubber.input.value = t;
            scrubber.label.textContent = formatTime(currentTime) + ' / ' + formatTime(dur);
            document.dispatchEvent(new CustomEvent('road-block:seek', { detail: { t: t } }));
        }

        document.addEventListener('mediabar:timeupdate', function (e) {
            var d = e.detail || {};
            if (d.duration > 0) syncFromAudio(d.currentTime, d.duration);
        });

        setInterval(function () {
            var a = document.querySelector('audio[data-mediabar], .media-bar audio');
            if (a && a.duration && !a.paused) syncFromAudio(a.currentTime, a.duration);
        }, 100);
    }

    // Wait until the world is actually loaded before injecting the scrubber
    document.addEventListener('afs:ready', boot);
    document.addEventListener('three-object-viewer:world-loaded', boot);

    // Fallback: watch for the canvas appearing inside the environment wrap
    function waitForCanvas() {
        var env = document.querySelector('.three-object-three-app-environment');
        if (!env) return;
        var observer = new MutationObserver(function () {
            if (env.querySelector('canvas')) {
                observer.disconnect();
                boot();
            }
        });
        observer.observe(env, { childList: true, subtree: true });
    }
    document.addEventListener('DOMContentLoaded', waitForCanvas);
})();
