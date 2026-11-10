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
import urllib.error
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
    return rpc_as({"user": "jsonrpc", "password": TOKEN}, method, **params)


def rpc_as(cred, method, **params):
    """A call with the application token (`jsonrpc`) or a user's own login and password."""
    auth = f"{cred['user']}:{cred['password']}".encode()
    req = urllib.request.Request(URL, data=json.dumps(
        {"jsonrpc": "2.0", "method": method, "id": 1, "params": params}).encode(), headers={
        "Content-Type": "application/json",
        "Authorization": "Basic " + base64.b64encode(auth).decode()})
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

    def test_7b_an_applied_ruling_is_said_and_offers_no_form(self):
        rpc("saveTaskMetadata", task_id=self.tid, values={"docket_ruling_state": "applied"})
        try:
            page = self.task_page()
            self.assertIn("rhizome recorded your ruling (option 2)", page)
            self.assertIsNone(form_of(page, self.tid)[0])
        finally:
            rpc("saveTaskMetadata", task_id=self.tid, values={"docket_ruling_state": "submitted"})

    def test_8_a_ruled_decision_shows_its_ruling_and_no_form(self):
        rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision": "ruled",
                                                          "rhiz_ruled_option": "2"})
        try:
            page = self.task_page()
            self.assertIn("Ruled: option 2.", page)
            self.assertIsNone(form_of(page, self.tid)[0])
        finally:
            rpc("saveTaskMetadata", task_id=self.tid, values={"rhiz_decision": "pending"})


    def test_9a_the_fields_panel_shows_every_rhiz_key_joined_and_no_docket_key(self):
        """docket-memory:pando-0019, design 3.4: read-only, in the task sidebar."""
        page = self.task_page()
        self.assertIn('class="docket-fields"', page)
        self.assertIn("<dt>decision_brief</dt>", page)
        self.assertIn("<dt>decision_options</dt>", page)
        self.assertIn(OPTIONS[1]["title"], page.split('class="docket-fields"')[1],
                      "the options' parts are joined in the panel")
        self.assertNotIn("decision_options#1", page)
        self.assertNotIn("<dt>docket_ruling", page, "the plugin's own keys are not rhizome's fields")

    def test_9b_getDocketRulings_returns_the_submission_in_one_call(self):
        """design 3.5, with the application token: every project, or the one named."""
        for params in ({}, {"project_id": self.pid}):
            rows = [r for r in rpc("getDocketRulings", **params) if r["task_id"] == self.tid]
            self.assertEqual(len(rows), 1, params)
            r = rows[0]
            self.assertEqual((r["reference"], r["project_id"], r["brief"], r["stale"]),
                             ("docket-memory:pando-9999", self.pid, BRIEF, False))
            self.assertEqual(r["docket_ruling"]["options"], [2])
        rpc("saveTaskMetadata", task_id=self.tid, values={"docket_ruling_state": "applied"})
        try:
            self.assertFalse([r for r in rpc("getDocketRulings", project_id=self.pid)],
                             "an applied ruling is not read back again")
        finally:
            rpc("saveTaskMetadata", task_id=self.tid, values={"docket_ruling_state": "submitted"})

    def test_9c_with_a_users_credentials_only_their_projects_are_read(self):
        """A plugin procedure gets no project ACL from Kanboard; the callback checks it."""
        name = "docket-test-viewer"
        old = rpc("getUserByName", username=name)
        if old:
            rpc("removeUser", user_id=old["id"])
        uid = rpc("createUser", username=name, password="docket-test-pw", role="app-user")
        other = rpc("createProject", name="docket-plugin-test-other")
        try:
            as_user = dict(user=name, password="docket-test-pw")
            self.assertEqual(rpc_as(as_user, "getDocketRulings"), [],
                             "not a member of the fixture project: nothing of it is read")
            rpc("addProjectUser", project_id=self.pid, user_id=uid, role="project-viewer")
            rows = rpc_as(as_user, "getDocketRulings")
            self.assertEqual([r["task_id"] for r in rows], [self.tid])
            # The JSON-RPC server answers an AccessDeniedException with HTTP 403, as it does for
            # Kanboard's own procedures.
            with self.assertRaises(urllib.error.HTTPError) as denied:
                rpc_as(as_user, "getDocketRulings", project_id=other)
            self.assertEqual(denied.exception.code, 403)
        finally:
            rpc("removeProject", project_id=other)
            rpc("removeUser", user_id=uid)


def journal(n_people=5, n_rechecks=4):
    """Rows as rhizome's render sends them (rhizome pando-0544): people's entries with a run of
    rechecks before the newest, and one entry long enough to be capped."""
    rows = []
    for i in range(n_people):
        rows.append({"cls": "meaningful", "grp": "", "kind": "comment", "head": "comment",
                     "text": f"said {i + 1}" + (" " + "z" * 2000 if i == 0 else "")})
    for i in range(n_rechecks):
        rows.insert(n_people - 1, {"cls": "system", "grp": "recheck", "kind": "comment",
                                   "head": "comment", "text": f"recheck: still blocked {i}"})
    for seq, r in enumerate(rows, start=1):
        r.update(seq=seq, key=f"k{seq:04d}", ts=f"2026-11-10T00:00:{seq:02d}Z", actor="pando")
    return rows


@unittest.skipIf(_why_not_ready(), _why_not_ready())
class TheJournalHistory(unittest.TestCase):
    """rhizome pando-0544, the operator's ruling 2026-11-10 (options 1-5): every journal row in the
    plugin's own table, the newest three people's entries on the task, the rest paged."""

    @classmethod
    def setUpClass(cls):
        cls.pid = rpc("createProject", name="docket-journal-test")
        uid = rpc("getUserByName", username=OPERATOR)["id"]
        rpc("addProjectUser", project_id=cls.pid, user_id=uid)
        cls.tid = rpc("createTask", project_id=cls.pid, title="docket-memory:pando-9998 — Long",
                      reference="docket-memory:pando-9998")
        cls.rows = journal()
        cls.b = Browser()
        cls.b.login()

    @classmethod
    def tearDownClass(cls):
        rpc("removeProject", project_id=cls.pid)

    def setUp(self):
        self.assertEqual(rpc("saveDocketJournal", task_id=self.tid, rows=self.rows, replace=True),
                         len(self.rows))

    def history(self, **q):
        q = dict({"controller": "JournalController", "action": "history", "plugin": "Docket",
                  "task_id": self.tid, "project_id": self.pid}, **q)
        return json.loads(self.b.get(q))

    def test_1_heads_name_the_count_and_last_key(self):
        heads = [h for h in rpc("getDocketJournalHeads", project_id=self.pid)]
        self.assertEqual(heads, [{"task_id": self.tid, "n": 9, "key": "k0009"}])

    def test_2_rows_that_do_not_run_on_are_refused_whole(self):
        gap = [dict(self.rows[0], seq=11, key="k0011")]
        with self.assertRaises(RuntimeError):
            rpc("saveDocketJournal", task_id=self.tid, rows=gap)
        self.assertEqual(rpc("getDocketJournalHeads", project_id=self.pid)[0]["n"], 9)
        more = [dict(self.rows[0], seq=10, key="k0010", text="said again")]
        self.assertEqual(rpc("saveDocketJournal", task_id=self.tid, rows=more), 10)

    def test_3_a_user_cannot_write_or_read_the_heads(self):
        with self.assertRaises(urllib.error.HTTPError) as denied:
            rpc_as({"user": OPERATOR, "password": PASSWORD}, "saveDocketJournal",
                   task_id=self.tid, rows=[], replace=True)
        self.assertEqual(denied.exception.code, 403)

    def test_4_the_task_shows_the_newest_three_peoples_entries(self):
        page = self.b.get({"controller": "TaskViewController", "action": "show", "task_id": self.tid})
        self.assertIn('class="docket-history"', page)
        part = page.split('class="docket-history-list"')[1].split("</ol>")[0]
        self.assertEqual(re.findall(r'data-seq="(\d+)"', part), ["9", "4", "3"],
                         "the rechecks (seq 5-8) are not counted")
        self.assertNotIn("recheck: still blocked", part)
        self.assertIn("show older", page)

    def test_5_older_pages_go_on_and_end(self):
        first = self.history(system=0, before=3, limit=20)
        self.assertEqual(re.findall(r'data-seq="(\d+)"', first["html"]), ["2", "1"])
        self.assertFalse(first["more"])
        self.assertIn("show all (2.0 KB)", first["html"], "the 2 KB entry is capped")

    def test_6_system_entries_fold_into_one_run_that_opens(self):
        h = self.history(system=1, collapse=1, limit=3)
        self.assertIn("recheck ×4", h["html"])
        self.assertTrue(h["more"])
        run = self.history(system=1, collapse=0, lo=5, before=9, limit=20)
        self.assertEqual(re.findall(r'data-seq="(\d+)"', run["html"]), ["8", "7", "6", "5"])

    def test_7_the_full_words_of_a_capped_entry(self):
        q = {"controller": "JournalController", "action": "entry", "plugin": "Docket",
             "task_id": self.tid, "project_id": self.pid, "seq": 1}
        self.assertEqual(json.loads(self.b.get(q))["text"], self.rows[0]["text"])

    def test_8_text_is_shown_escaped(self):
        rpc("saveDocketJournal", task_id=self.tid, replace=True,
            rows=[dict(self.rows[0], text="<script>alert(1)</script>")])
        page = self.b.get({"controller": "TaskViewController", "action": "show", "task_id": self.tid})
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)
        self.assertNotIn("<script>alert(1)</script>", page)

    def test_9_a_viewer_of_another_project_reads_nothing(self):
        name = "docket-journal-viewer"
        old = rpc("getUserByName", username=name)
        if old:
            rpc("removeUser", user_id=old["id"])
        uid = rpc("createUser", username=name, password="docket-test-pw", role="app-user")
        try:
            b = Browser()
            page = b.get({"controller": "AuthController", "action": "login"})
            token = re.search(r'name="csrf_token" value="([^"]+)"', page).group(1)
            b.post(BASE + "?controller=AuthController&action=check",
                   {"csrf_token": token, "username": name, "password": "docket-test-pw"})
            try:
                body = b.get({"controller": "JournalController", "action": "history",
                              "plugin": "Docket", "task_id": self.tid, "project_id": self.pid})
            except urllib.error.HTTPError as exc:
                body = str(exc.code)
            self.assertNotIn("said", body)
        finally:
            rpc("removeUser", user_id=uid)


@unittest.skipIf(not list(PREFIX.glob("root/usr/bin/php8*")), f"no PHP under {PREFIX}/root")
class TheRulingRules(unittest.TestCase):
    """test/php/ruling_test.php and journal_test.php, with the PHP the setup script installs."""

    def run_php(self, name):
        php = sorted(PREFIX.glob("root/usr/bin/php8*"))[0]
        env = dict(os.environ, LD_LIBRARY_PATH=str(PREFIX / "root/usr/lib/x86_64-linux-gnu"))
        r = subprocess.run([str(php), "-n", str(HERE / "php" / name)],
                           capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("0 failed", r.stdout)

    def test_the_php_checks_pass(self):
        self.run_php("ruling_test.php")

    def test_the_journal_paging_checks_pass(self):
        self.run_php("journal_test.php")


if __name__ == "__main__":
    unittest.main()
