# Lang4 Phase 13: handwriting coverage and profile readiness

**There is no real Hindi sample in this project.** Everything here is either
a text audit of the prompts (which characters they contain) or SYNTHETIC:
profiles learned from geometric pseudo-glyph pages, with no fonts and no
one's handwriting. None of it is evidence of real handwriting accuracy. The
only real page is Latin (`reference/handwriting_03.png`). The opt-in test
rechecks it for regressions.

## Prompt changes

* **Slot 3 (digits, punctuation, sentence).** The row of lone marks
  `. , ; : ? ! ( ) - " ' / % & + = ₹` was replaced by two lines that put
  each mark inside words: `Yes. No, maybe; at 5: why? Wow!` and
  `(soon) re-do "hi" it's a/b 50% A&B 2+2=4 ₹10`. A row of lone marks gives
  no word spacing to tell the marks apart, so every mark was refused
  ("word spacing not clearly different from letter spacing"). The 27
  digits and marks taught are unchanged.
* **Slot 4 (Hindi paragraph).** There is now an optional suggested text:
  8 everyday sentences dense in the clusters that ordinary Hindi uses most
  and that the alphabet sample cannot teach, plus the danda `।`. The
  alphabet sample shows matras only on क, so it covers clusters such as
  ता ना दी मा ने है में से. The sentences were chosen by hand, not from a
  measured corpus frequency list.
* **Slot 5 (natural writing).** There is now an optional mixed English and
  Hindi suggestion with numbers, ₹ and a dash.
* **Wizard.** Slots 4 and 5 show the suggestion. After a photo is chosen,
  the button "I copied the suggested text" fills in the transcription.
  Users can still write their own text, or skip the transcription.

## `synthetic/prompt-audit-and-support.json`

**sets.** Each coverage set is either required or optional:

* Required sets gate the profile: English lowercase and capitals, Hindi
  consonants, and the Hindi alphabet sample.
* Optional sets are only reported: digits and punctuation, and the
  everyday Hindi clusters of the suggested text.
* A character in both kinds of set counts as required only.

**promptAudit.** This shows the share of each document's units that the
prompts contain at all, which is an upper bound on what a profile can
write:

| Document | Prescribed prompts only | With the suggested texts |
|---|---|---|
| Hindi audit passage | 41.9 % | 84.3 % (partly fitted: the suggestions were written with this passage in view) |
| Hindi held-out passage | 45.9 % | 80.6 % |
| English | 99.6 % | 100 % |

**support.** These are the support statements of two complete synthetic
profiles built with dot marks written apart:

* `p13old` used free text in slots 4–5 and the old slot 3.
* `p13new` copied the suggested texts and used the new slot 3.

For `p13new`, English has all 52 required characters and 26 of 27
optional ones; `3` was refused as ambiguous inside `0123456789`. Hindi has
all 75 required clusters and 43 of 61 optional ones. The 18 missing
clusters are: ते खे मे है ड़ा पे था हे थे ऊँ सा रे लौ टा ही पी रो तें.
Most were refused because an e-matra overhang straddles the cluster
boundary, or because a neighbouring cluster was uncertain.

## `synthetic/document-coverage.json`

This shows the share of rendering units that the same two profiles draw
on held-out documents. The rest show as dashed boxes.

| Document | Free texts (p13old) | Suggested texts (p13new) |
|---|---|---|
| Hindi held-out | 54.1 % | 74.5 % |
| Hindi audit passage | 47.6 % | 74.3 % |
| English | 94.5 % | 100 % |
| Mixed English / Hindi | 75.5 % | 90.2 % |

## What a profile claims

The report states each script at one of three levels:

* **"all required … learned"**: every required set is learned.
* **"usable, but N required … are missing (…)"**: some required
  characters are missing, and each one is named.
* **"not enough learned"**: a requirement fails, and no profile is made.

It never says a language is complete. For Hindi, the statement always ends
"Other clusters are written only once learned; until then they show as
dashed boxes." This is because no prompt set teaches every cluster.

## Mark boundaries

No change was made to the decisions. The synthetic evidence did not show a
safe fix for the e-matra overhang that straddles a cluster boundary, so
those clusters stay refused. The refusal reasons now name the mark, for
example: "the anusvara of “हैं” should be 1 separate dot …" and "its
neighbour “में” is missing its anusvara …". The Phase 12 Devanagari bench
is identical before and after this phase, apart from reason wording.
