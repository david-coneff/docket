"""docket-memory:pando-0005: schemas/proposal.schema.json is the proposal format. Every
proposal in the repo validates against it, `validate` uses it, its vocabularies match the
UI's, and the evaluator refuses a keyword it does not implement."""
import copy
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "docket-propose.py"
SCHEMA = REPO / "schemas" / "proposal.schema.json"
EXAMPLE = REPO / "examples" / "rhiz-proposals" / "prop-2026-06-21-001.proposal.json"

spec = importlib.util.spec_from_file_location("docket_propose", TOOL)
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)


def repo_proposals():
    return sorted(p for pat in ("*.proposal.json", "*.resolved.json") for p in REPO.rglob(pat)
                  if "node_modules" not in p.parts)


def js_strings(path: Path, block: str) -> set[str]:
    """The quoted strings inside `export const <block> = ...;` in a src/lib module."""
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"export const {block} = ([\[{{].*?[\]}}]);", text, re.S)
    return set(re.findall(r"'([^']+)'", m.group(1)))


class ProposalSchema(unittest.TestCase):
    def setUp(self):
        self.schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.good = json.loads(EXAMPLE.read_text(encoding="utf-8"))

    def errors(self, obj):
        return dp.validate_proposal(obj, self.schema)

    def test_every_proposal_in_the_repo_validates(self):
        found = repo_proposals()
        self.assertTrue(found, "no proposal files found")
        for path in found:
            with self.subTest(path=str(path.relative_to(REPO))):
                self.assertEqual(self.errors(json.loads(path.read_text(encoding="utf-8"))), [])

    def test_the_example_references_the_schema_by_a_path_that_resolves(self):
        self.assertEqual((EXAMPLE.parent / self.good["$schema"]).resolve(), SCHEMA)

    def test_validate_reads_the_schema_file(self):
        # A copy of the tool with its schema beside it, so the schema can be narrowed safely.
        d = Path(tempfile.mkdtemp(prefix="docket-schema-"))
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        shutil.copy(TOOL, d)
        shutil.copytree(SCHEMA.parent, d / "schemas")
        (d / "rhiz-proposals").mkdir()
        shutil.copy(EXAMPLE, d / "rhiz-proposals")
        run = lambda: subprocess.run([sys.executable, str(d / TOOL.name), "--root", str(d), "validate",
                                      "--proposal", EXAMPLE.name.replace(".proposal.json", "")],
                                     capture_output=True, text=True)
        self.assertEqual(run().returncode, 0)
        # The same file fails once the schema says so: the CLI has no vocabulary of its own.
        narrowed = copy.deepcopy(self.schema)
        narrowed["properties"]["status"]["enum"] = ["approved"]
        (d / "schemas" / SCHEMA.name).write_text(json.dumps(narrowed), encoding="utf-8")
        r = run()
        self.assertEqual(r.returncode, 1)
        self.assertIn("Invalid status 'open'", r.stdout)

    def test_each_rule_is_enforced(self):
        cases = {
            "Missing required field: title": lambda p: p.pop("title"),
            "Invalid status 'merged'": lambda p: p.update(status="merged"),
            "Invalid weight 'huge'": lambda p: p.update(weight="huge"),
            "'file_changes' must be a non-empty array": lambda p: p.update(file_changes=[]),
            "file_changes[0]: missing required field 'after'": lambda p: p["file_changes"][0].pop("after"),
            "file_changes[0]: invalid status 'done'": lambda p: p["file_changes"][0].update(status="done"),
            "file_changes[1].comments: must be array": lambda p: p["file_changes"][1].update(comments={}),
            "file_changes[0].tags[0]: must be string": lambda p: p["file_changes"][0].update(tags=[3]),
            "file_changes[0]: invalid reviewer_edit_mode 'final'":
                lambda p: p["file_changes"][0].update(reviewer_edit="x", reviewer_edit_mode="final"),
            "file_changes[0].reviewer_edit: must be string":
                lambda p: p["file_changes"][0].update(reviewer_edit_mode="commit-as-is"),
            "file_changes[0].comments[0]: invalid role 'praise'":
                lambda p: p["file_changes"][0].update(comments=[{"id": "comment-01", "role": "praise", "text": ""}]),
            "file_changes[0].comments[0].attachments[0]: missing required field 'path'":
                lambda p: p["file_changes"][0].update(comments=[{"id": "comment-01", "role": "general", "text": "",
                                                                 "attachments": [{"filename": "a.txt"}]}]),
        }
        for expected, mutate in cases.items():
            with self.subTest(expected=expected):
                p = copy.deepcopy(self.good)
                mutate(p)
                errs = self.errors(p)
                self.assertTrue(any(expected in e for e in errs), errs)

    def test_a_reviewed_file_change_validates(self):
        p = copy.deepcopy(self.good)
        p["weight"], p["weight_agent"] = "significant", "standard"
        p["file_changes"][0].update(
            status="edited-for-agent", reviewer_edit="# Edited\n", reviewer_edit_mode="agent-feedback",
            reviewer_edit_notes=None,
            comments=[{"id": "comment-01", "created": "2026-06-21T20:00:00Z", "role": "edit-note",
                       "text": "see para 3", "attachments": [
                           {"filename": "ci-log.txt", "mime_type": "text/plain", "path": "/tmp/ci-log.txt"}]}])
        self.assertEqual(self.errors(p), [])

    def test_the_vocabularies_match_the_ui(self):
        defs = self.schema["$defs"]
        self.assertEqual(set(defs["weight"]["enum"]), js_strings(REPO / "src/lib/weight.js", "WEIGHTS"))
        self.assertEqual(set(defs["file_change"]["properties"]["status"]["enum"]),
                         js_strings(REPO / "src/lib/resolve.js", "STATES") | {"pending"})

    def test_an_unimplemented_keyword_is_refused(self):
        s = copy.deepcopy(self.schema)
        s["properties"]["title"]["pattern"] = "^A"
        with self.assertRaises(ValueError):
            dp.validate_proposal(self.good, s)


if __name__ == "__main__":
    unittest.main()
