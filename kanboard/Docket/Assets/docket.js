// docket: in a ruling form, an option a ticked option excludes (either way round) cannot be
// ticked, and the words become required when OTHER is ticked or nothing is. The server checks the
// same rules (Lib/Ruling.php); this only says so before the submit.
(function () {
    'use strict';

    function excludes(box) {
        return (box.getAttribute('data-excludes') || '').split(',').filter(Boolean);
    }

    function refresh(form) {
        var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="options[]"]'));
        var ticked = boxes.filter(function (b) { return b.checked; });
        boxes.forEach(function (box) {
            var blocked = ticked.some(function (t) {
                return t !== box && (excludes(t).indexOf(box.value) !== -1 || excludes(box).indexOf(t.value) !== -1);
            });
            box.disabled = blocked && !box.checked;
            box.parentNode.classList.toggle('docket-excluded', box.disabled);
        });
        var other = form.querySelector('input[name="other"]');
        var words = form.querySelector('textarea[name="words"]');
        if (words) {
            words.required = (other && other.checked) || ticked.length === 0;
        }
    }

    document.addEventListener('change', function (e) {
        var form = e.target.closest && e.target.closest('form.docket-ruling');
        if (form) {
            refresh(form);
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        Array.prototype.forEach.call(document.querySelectorAll('form.docket-ruling'), refresh);
    });
}());

// docket: a task's journal history (Lib/Journal.php, rhizome pando-0544). The newest entries are on
// the page already; this fetches the rest when asked: older pages, the system entries (toggle),
// the rows of one folded run, and the full words of an entry cut at the cap. Every word arrives
// escaped in server-rendered HTML or is set as text, never as markup.
(function () {
    'use strict';

    function getJson(url, done) {
        var req = new XMLHttpRequest();
        req.open('GET', url);
        req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        req.onload = function () {
            var doc = null;
            try { doc = JSON.parse(req.responseText); } catch (e) { doc = null; }
            done(req.status === 200 ? doc : null);
        };
        req.onerror = function () { done(null); };
        req.send();
    }

    function withParams(url, params) {
        return url + Object.keys(params).map(function (k) {
            return '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('');
    }

    function append(list, html) {
        list.insertAdjacentHTML('beforeend', html);
    }

    // A "show older" button reads its page after data-before, into the list before it.
    function older(button, list, url, limit) {
        button.disabled = true;
        getJson(withParams(url, {before: button.getAttribute('data-before'), limit: limit}), function (doc) {
            button.disabled = false;
            if (!doc) { button.textContent = 'could not load; try again'; return; }
            append(list, doc.html);
            button.setAttribute('data-before', doc.next_before);
            button.hidden = !doc.more;
        });
    }

    function section(el) { return el.closest && el.closest('section.docket-history'); }

    function base(sec) {
        var system = sec.querySelector('input.docket-show-system');
        return sec.getAttribute(system && system.checked ? 'data-url-system' : 'data-url-meaningful');
    }

    document.addEventListener('click', function (e) {
        var t = e.target;
        var sec = section(t);
        if (!sec || t.tagName !== 'BUTTON') { return; }
        if (t.classList.contains('docket-older')) {
            var list = t.previousElementSibling;
            older(t, list, base(sec), sec.getAttribute('data-page'));
        } else if (t.classList.contains('docket-run-open') || t.classList.contains('docket-run-older')) {
            var entry = t.closest('li.docket-run');
            var rows = entry.querySelector('ol.docket-run-rows');
            var more = entry.querySelector('button.docket-run-older');
            if (!more) {
                more = document.createElement('button');
                more.type = 'button';
                more.className = 'btn docket-run-older';
                more.textContent = 'show older in this run';
                more.setAttribute('data-url', t.getAttribute('data-url'));
                more.setAttribute('data-before', t.getAttribute('data-before'));
                entry.appendChild(more);
                t.hidden = true;
            }
            older(more, rows, more.getAttribute('data-url'), sec.getAttribute('data-page'));
        } else if (t.classList.contains('docket-full')) {
            t.disabled = true;
            getJson(t.getAttribute('data-url'), function (doc) {
                if (!doc) { t.disabled = false; t.textContent = 'could not load; try again'; return; }
                var text = t.parentNode.querySelector('.docket-entry-text');
                text.textContent = doc.text;
                t.remove();
            });
        }
    });

    document.addEventListener('change', function (e) {
        var t = e.target;
        var sec = section(t);
        if (!sec || !t.classList.contains('docket-show-system')) { return; }
        var list = sec.querySelector('ol.docket-history-list');
        var button = sec.querySelector('button.docket-older');
        t.disabled = true;
        getJson(withParams(base(sec), {limit: sec.getAttribute('data-first')}), function (doc) {
            t.disabled = false;
            if (!doc) { t.checked = !t.checked; return; }
            list.innerHTML = doc.html;
            button.setAttribute('data-before', doc.next_before);
            button.hidden = !doc.more;
        });
    });
}());
