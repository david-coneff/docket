"""The Docket Kanboard plugin (docket-memory:pando-0018), end to end against a real Kanboard.

It needs the local Kanboard that rhizome's `setup-kanboard-env.sh` installs (PHP and PostgreSQL),
with this repo's `kanboard/Docket` in its `plugins/` directory. Without them every test here is
SKIPPED, and says why; nothing reads as a pass that did not run.

  bash <rhizome-protocol>/tools/env/layer5-goal/kanboard/setup-kanboard-env.sh
  eval "$(bash <rhizome-protocol>/tools/env/layer5-goal/kanboard/setup-kanboard-env.sh --env)"
  python3 -m unittest test/test_kanboard_plugin.py

The fixture is its own project (removed afterwards): one task carrying what rhizome's render
writes for a pending decision (`rhiz_decision`, `rhiz_decision_brief`, and the options in parts,
as PostgreSQL's 255-character column makes it store them). The tests sign in as the operator,
use the form as a browser would, and read the result back through the JSON-RPC API.
"""
import base64
import html
import http.cookiejar
import json
import os
import re
import subprocess
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
URL = os.environ.get("RHIZ_KANBOARD_URL", "")
TOKEN = os.environ.get("RHIZ_KANBOARD_TOKEN", "")
BASE = URL.rsplit("/", 1)[0] + "/" if URL else ""
OPERATOR = (os.environ.get("RHIZ_KANBOARD_OPERATORS", "admin").split(",")[0].strip() or "admin")
PASSWORD = os.environ.get("RHIZ_KANBOARD_PASSWORD", "admin")
PREFIX = Path(os.environ.get("RHIZ_KANBOARD_PREFIX", Path.home() / ".local/opt/rhiz-kanboard"))

OPTIONS = [{"n": 1, "title": "Go now " + "x" * 120, "excludes": [], "other": False},
           {"n": 2, "title": "Wait for the landing " + "y" * 120, "excludes": [1], "other": False},
           {"n": 3, "title": "Also file a follow-up", "excludes": [], "other": False},
           {"n": 4, "title": "OTHER", "excludes": [], "other": True}]
BRIEF = "2026-11-06T01:00:00Z"


def rpc(method, **params):
    req = urllib.request.Request(URL, data=json.dumps(
        {"jsonrpc": "2.0", "method": method, "id": 1, "params": params}).encode(), headers={
        "Content-Type": "application/json",
        "Authorization": "Basic " + base64.b64encode(f"jsonrpc:{TOKEN}".encode()).decode()})
    with urllib.request.urlopen(req, timeout=30) as r:
        doc = json.loads(r.read().decode())
    if "error" in doc:
        raise RuntimeError(f"{method}: {doc['error']}")
    return doc["result"]


def chunked(key, value, size=255):
    if len(value) <= size:
        return {key: value}
    parts = [value[i:i + size] for i in range(0, len(value), size)]
    out = {key: f"rhiz:chunks:{len(parts)}"}
    out.update({f"{key}#{n}": p for n, p in enumerate(parts, start=1)})
    return out


def _why_not_ready():
    if not URL or not TOKEN:
        return "RHIZ_KANBOARD_URL/_TOKEN unset: eval \"$(setup-kanboard-env.sh --env)\""
    try:
        rpc("getVersion")
    except Exception as exc:  # noqa: BLE001 - any failure means the board is not there
        return f"Kanboard does not answer at {URL}: {exc}"
    plugins = list(PREFIX.glob("kanboard-*/plugins/Docket"))
    if not plugins:
        return f"the Docket plugin is not installed under {PREFIX}/kanboard-*/plugins/"
    return ""


class Browser:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.open = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar)).open

    def get(self, query):
        with self.open(BASE + "?" + urllib.parse.urlencode(query), timeout=30) as r:
            return r.read().decode()

    def post(self, action, fields):
        data = urllib.parse.urlencode(fields, doseq=True).encode()
        with self.open(urllib.request.Request(action, data=data), timeout=30) as r:
            return r.read().decode()

    def login(self):
        page = self.get({"controller": "AuthController", "action": "login"})
        token = re.search(r'name="csrf_token" value="([^"]+)"', page).group(1)
        self.post(BASE + "?controller=AuthController&action=check",
                  {"csrf_token": token, "username": OPERATOR, "password": PASSWORD})


def form_of(page, task_id):
    """(action URL, csrf token) of THIS task's ruling form on the page. Never the first form: the
    inbox lists every pending decision the operator can see, real ones included, and a test that
    submitted the first one ruled on a real decision (2026-11-06, caught before any importer)."""
    for m in re.finditer(r'<form class="docket-ruling" method="post" action="([^"]+)"', page):
        action = html.unescape(m.group(1))
        if dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(action).query)).get("task_id") \
                == str(task_id):
            break
    else:
        return None, None
    rest = page[m.end():]
    token = re.search(r'name="csrf_token" value="([^"]+)"', rest).group(1)
    return urllib.parse.urljoin(BASE, html.unescape(m.group(1))), token


@unittest.skipIf(_why_not_ready(), _why_not_ready())
class TheRulingForm(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.pid = rpc("createProject", name="docket-plugin-test")
        uid = rpc("getUserByName", username=OPERATOR)["id"]
        rpc("addProjectUser", project_id=cls.pid, user_id=uid)
        cls.tid = rpc("createTask", project_id=cls.pid, title="docket-memory:pando-9999 — Pick",
                      reference="docket-memory:pando-9999")
        meta = {"rhiz_decision": "pending", "rhiz_decision_brief": BRIEF}
        meta.update(chunked("rhiz_decision_options", json.dumps(OPTIONS, separators=(",", ":"))))
        assert len(meta) > 3, "the options are long enough to arrive in parts"
        rpc("saveTaskMetadata", task_id=cls.tid, values=meta)
        cls.b = Browser()
        cls.b.login()

    @classmethod
    def tearDownClass(cls):
        rpc("removeProject", project_id=cls.pid)

    def task_page(self):
        return self.b.get({"controller": "TaskViewController", "action": "show", "task_id": self.tid})

    def submit(self, fields, page=None):
        action, token = form_of(page or self.task_page(), self.tid)
        self.assertIsNotNone(action, "the task page shows a ruling form")
        return self.b.post(action, dict(fields, csrf_token=token))

    def meta(self):
        return rpc("getTaskMetadata", task_id=self.tid)

    def test_1_the_form_offers_every_option_joined_from_its_parts(self):
        page = self.task_page()
        for o in OPTIONS[:3]:
            self.assertIn(html.escape(o["title"], quote=False), page)
        self.assertIn('name="other"', page)
        self.assertIn('data-excludes="1"', page, "option 2's exclusion reaches the browser")

    def test_2_an_exclusive_pair_is_refused_and_nothing_is_saved(self):
        page = self.submit({"options[]": ["1", "2"], "words": ""})
        self.assertNotIn("docket_ruling", self.meta())
        self.assertIn("Option 1 cannot be taken with option 2.", page,
                      "said on the page the form returns to")

    def test_3_other_without_words_is_refused(self):
        page = self.submit({"options[]": ["3"], "other": "1", "words": "  "})
        self.assertNotIn("docket_ruling", self.meta())
        self.assertIn("OTHER needs your words.", page)

    def test_4_several_options_and_words_are_one_ruling_and_one_comment(self):
        self.submit({"options[]": ["1", "3"], "other": "1", "words": "go, and also do X"})
        m = self.meta()
        r = json.loads(m["docket_ruling"])
        self.assertEqual((r["options"], r["other"], r["user"], r["brief"]),
                         ([1, 3], True, OPERATOR, BRIEF))
        self.assertEqual(m["docket_ruling_state"], "submitted")
        c = rpc("getComment", comment_id=r["comment_id"])
        self.assertEqual((c["comment"], c["username"]), ("go, and also do X", OPERATOR),
                         "the comment holds the words, by the operator: BG-25's source")
        self.assertIn("Submitted: option 1,3,other", self.task_page())

    def test_5_the_inbox_lists_it_under_submitted_and_rules_from_there(self):
        page = self.b.get({"controller": "DecisionController", "action": "inbox", "plugin": "Docket"})
        self.assertIn("docket-memory:pando-9999", page)
        self.assertIn("Submitted, not yet recorded by rhizome", page)
        rpc("saveTaskMetadata", task_id=self.tid, values={"docket_ruling_state": "refused"})
        page = self.b.get({"controller": "DecisionController", "action": "inbox", "plugin": "Docket"})
        self.submit({"options[]": ["2"], "words": ""}, page=page)
        r = json.loads(self.meta()["docket_ruling"])
        self.assertEqual((r["options"], r["other"]), ([2], False))
        self.assertEqual(rpc("getComment", comment_id=r["comment_id"])["comment"],
                         "Ruled: option 2.")

    def test_6_a_new_brief_makes_the_submission_stale(self):
        rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision_brief": "2026-11-06T09:00:00Z"})
        try:
            self.assertIn("A ruling was submitted against an earlier brief", self.task_page())
        finally:
            rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision_brief": BRIEF})

    def test_7_the_board_search_finds_pending_decisions(self):
        page = self.b.get({"controller": "SearchController", "action": "index",
                           "search": "decision:pending"})
        self.assertIn("docket-memory:pando-9999", page)

    def test_8_a_ruled_decision_shows_its_ruling_and_no_form(self):
        rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision": "ruled",
                                                          "rhiz_ruled_option": "2"})
        try:
            page = self.task_page()
            self.assertIn("Ruled: option 2.", page)
            self.assertIsNone(form_of(page, self.tid)[0])
        finally:
            rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision": "pending"})


@unittest.skipIf(not list(PREFIX.glob("root/usr/bin/php8*")), f"no PHP under {PREFIX}/root")
class TheRulingRules(unittest.TestCase):
    """test/php/ruling_test.php, with the PHP the setup script installs."""

    def test_the_php_checks_pass(self):
        php = sorted(PREFIX.glob("root/usr/bin/php8*"))[0]
        env = dict(os.environ, LD_LIBRARY_PATH=str(PREFIX / "root/usr/lib/x86_64-linux-gnu"))
        r = subprocess.run([str(php), "-n", str(HERE / "php" / "ruling_test.php")],
                           capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("0 failed", r.stdout)


if __name__ == "__main__":
    unittest.main()
