"""docket-memory:pando-0004: `new`, `add-file` and `validate` warn (exit 0) on each tag the
active taxonomy does not list; the project-local taxonomy wins over the root one."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / "docket-propose.py"
LOCAL_TAXONOMY = "---\nschema-version: \"1\"\n---\n```yaml\ncategories:\n  - id: local\n    tags:\n      - id: only-local\n```\n"


class UnknownTagsWarn(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp(prefix="docket-tags-"))
        self.addCleanup(shutil.rmtree, self.d, ignore_errors=True)
        (self.d / ".git").mkdir()                       # find_repo_root stops here
        for name, text in (("before.md", ""), ("after.md", "# A\n")):
            (self.d / name).write_text(text)

    def run_tool(self, *args):
        return subprocess.run([sys.executable, str(TOOL), *args], cwd=self.d,
                              capture_output=True, text=True)

    def new(self, *tags):
        r = self.run_tool("new", "--title", "t", "--agent-notes", "n", "--path", "before.md",
                          "--after", "after.md", "--tags", *tags)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r, next((self.d / "rhiz-proposals").glob("*.proposal.json")).stem.replace(".proposal", "")

    def test_new_warns_on_an_unknown_tag_and_not_on_a_known_one(self):
        r, _ = self.new("known-bug", "made-up-tag")
        self.assertIn("'made-up-tag' is not in the active taxonomy", r.stderr)
        self.assertNotIn("'known-bug'", r.stderr)

    def test_add_file_and_validate_warn_too_with_exit_0(self):
        _, pid = self.new("known-bug")
        r = self.run_tool("add-file", "--proposal", pid, "--path", "before.md",
                          "--after", "after.md", "--tags", "another-unknown")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("file-02: tag 'another-unknown'", r.stderr)
        r = self.run_tool("validate", "--proposal", pid)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("'another-unknown' is not in the active taxonomy", r.stderr)

    def test_the_project_local_taxonomy_wins(self):
        (self.d / "rhiz-proposals").mkdir()
        (self.d / "rhiz-proposals" / "tag-taxonomy.md").write_text(LOCAL_TAXONOMY)
        r, _ = self.new("only-local", "known-bug")
        self.assertNotIn("'only-local'", r.stderr)
        self.assertIn("'known-bug' is not in the active taxonomy", r.stderr)


if __name__ == "__main__":
    unittest.main()
