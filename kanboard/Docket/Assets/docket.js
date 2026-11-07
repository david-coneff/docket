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
