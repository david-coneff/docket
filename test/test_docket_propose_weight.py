"""docket-memory:pando-0011 (DP-1): `new --weight` records the tier (default standard), and
`validate` refuses an unknown one while accepting a proposal written before the field."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / "docket-propose.py"


class WeightTier(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp(prefix="docket-weight-"))
        self.addCleanup(shutil.rmtree, self.d, ignore_errors=True)
        (self.d / ".git").mkdir()
        (self.d / "before.md").write_text("")
        (self.d / "after.md").write_text("# A\n")

    def run_tool(self, *args):
        return subprocess.run([sys.executable, str(TOOL), *args], cwd=self.d,
                              capture_output=True, text=True)

    def new(self, *extra):
        r = self.run_tool("new", "--title", "t", "--agent-notes", "n", "--path", "before.md",
                          "--after", "after.md", *extra)
        self.assertEqual(r.returncode, 0, r.stderr)
        f = next((self.d / "rhiz-proposals").glob("*.proposal.json"))
        return f, json.loads(f.read_text())

    def test_the_default_is_standard_and_the_flag_sets_it(self):
        _, p = self.new()
        self.assertEqual(p["weight"], "standard")
        shutil.rmtree(self.d / "rhiz-proposals")
        _, p = self.new("--weight", "trivial")
        self.assertEqual(p["weight"], "trivial")

    def test_an_unknown_tier_is_refused_at_new(self):
        r = self.run_tool("new", "--title", "t", "--agent-notes", "n", "--path", "before.md",
                          "--after", "after.md", "--weight", "huge")
        self.assertNotEqual(r.returncode, 0)

    def test_validate_refuses_an_unknown_tier_and_accepts_none(self):
        f, p = self.new()
        pid = f.name.replace(".proposal.json", "")
        p["weight"] = "huge"
        f.write_text(json.dumps(p))
        r = self.run_tool("validate", "--proposal", pid)
        self.assertEqual(r.returncode, 1)
        self.assertIn("Invalid weight 'huge'", r.stdout)
        del p["weight"]
        f.write_text(json.dumps(p))
        self.assertEqual(self.run_tool("validate", "--proposal", pid).returncode, 0)


if __name__ == "__main__":
    unittest.main()
