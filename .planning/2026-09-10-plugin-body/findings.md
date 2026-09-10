# Findings
Current HEAD cec3f36. T0/T1 and three T2 batches accepted on macOS arm64. noteContent updates title/color only; transactions already compare blocks to publish metadataOnly. Existing journal is capped at 8 MiB and has operation receipts. Plan pointer referenced archived sandbox work; use a new plan for current model.
Body API will explicitly replace text with paragraphs, not expose internal BlockNote JSON or imply rich-text round trips. History must retain original blocks/preview for undo and regenerate preview on replacement. Creation and custom cards remain later T2 slices.
