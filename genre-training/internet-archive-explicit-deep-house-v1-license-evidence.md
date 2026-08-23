# Internet Archive explicit Deep House v1 evidence

This candidate overlay is training-only. Audio is stored on the external cache and is not committed.

Admission requires all of the following:

- The Archive item declares `CC-BY-SA`.
- The Archive item subject or description explicitly supports Deep House.
- The selected original MP3 has an embedded ID3 genre of `Deep House`.
- One track is selected from each Archive item.
- URL, title, artist, and label metadata are not inference features.

The manifest records the item URL, audio URL, license URL, expected MD5/SHA-1, item-level evidence, and track-level evidence for every selected track. Item-level broad tags without matching per-track ID3 were rejected. Examples rejected by this audit include Ambient, Dub Techno, Techno, Breaks, and generic House tracks found inside broadly tagged items.

This is one provider family. It is excluded from the Internet Archive outer fold and is paired with the independent FMA Deep House overlay during provider-heldout screening.
