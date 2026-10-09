"""Verify the teaching indexes against columns in the actual supplied PDF.

The three number ranges are deliberately expanded in the app. The original's
truncated 'rolling pi' and documented classroom sentence adaptations are explicit
exceptions, not silent source mismatches. Output is a machine-readable audit.
"""
import json
import re
import sys
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[3]
vocabulary = json.loads((root / "work/vocab_extract/vocabulary.json").read_text())
sentences = json.loads((root / "work/manual_curriculum_source/sentences.json").read_text())
norm = lambda value: re.sub("[^a-z0-9]", "", value.lower())
findings = []
counts = {"matchedVocabularyEntries": 0, "expandedNumberEntries": 0, "correctedVocabularyEntries": 0, "matchedSentenceStructures": 0}

with pdfplumber.open(sys.argv[1]) as pdf:
    if len(pdf.pages) != 44:
        raise AssertionError("Expected the original 44-page guide")
    cache = {}

    def column(page_number, column_number):
        if page_number not in cache:
            page = pdf.pages[page_number - 1]
            # The K1 section uses A4 landscape and a wider left margin.
            left = 70 if page.width > 800 else 31
            third = (page.width - 2 * left) / 3
            cache[page_number] = [norm(page.crop((left + i * third, 0, left + (i + 1) * third, page.height)).extract_text()) for i in range(3)]
        return cache[page_number][column_number]

    for level in vocabulary["levels"]:
        for topic in level["topics"]:
            source = "".join(column(page, 1 if topic.get("kind") == "grammar-key-vocabulary" else 0) for page in topic["sourcePages"])
            for item in topic["items"]:
                if norm(item) in source:
                    counts["matchedVocabularyEntries"] += 1
                elif topic["name"].startswith("Numbers "):
                    if norm(topic["name"]) not in source:
                        findings.append({"missingNumberRange": topic["name"]})
                    counts["expandedNumberEntries"] += 1
                elif item == "rolling pin" and "rollingpi" in source:
                    counts["correctedVocabularyEntries"] += 1
                else:
                    findings.append({"level": level["id"], "missingVocabulary": item, "pages": topic["sourcePages"]})
    for level in sentences["levels"]:
        for sentence in level["sentences"]:
            phrase = sentence["text"]
            for adaptation in sentences["adaptationsForClassroomUse"]:
                phrase = phrase.replace(adaptation["used"], adaptation["printed"])
            phrase = re.sub(r"^Subject[^:]+: ", "", phrase)
            if norm(phrase) in column(sentence["sourcePage"], 1):
                counts["matchedSentenceStructures"] += 1
            else:
                findings.append({"level": level["id"], "missingSentence": sentence["text"], "page": sentence["sourcePage"]})

result = {"passed": not findings, "originalPages": 44, **counts, "unresolvedSourceMismatches": findings}
print(json.dumps(result, ensure_ascii=False))
if findings:
    sys.exit(1)
