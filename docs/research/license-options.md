# License options for tegakko

## Context

Tegakko is a small, single-user Japanese handwriting-practice PWA, intended for a portfolio website. The owner wants others to reuse it and keep distributed modifications open, and accepts that people may charge for copies if they share the source under the same terms. A recognized open source license permits commercial use and forbids restrictions on commercial fields of use. [Open Source Definition](https://opensource.org/osd) · [OSI FAQ](https://opensource.org/faq)

## Options

| License | Reuse and commercial charging | Source-sharing conditions | Fit here |
| --- | --- | --- | --- |
| **MIT** | Anyone may use, modify, distribute, sublicense, and sell copies or substantial portions. | Keep the copyright and permission notice with copies or substantial portions. It does not require publishing derivative source. | Best only if broad reuse, including closed commercial reuse, is acceptable. A business could incorporate it into a closed product. [MIT text](https://opensource.org/license/mit) |
| **Apache-2.0** | Permits use, modification, redistribution, sublicensing, and sale, including commercially. | Provide the license, mark modified files, preserve applicable notices, and carry forward any required `NOTICE` attributions. Also includes an express contributor patent license and a patent-litigation termination provision. | A good alternative if the explicit patent grant is a priority; its additional notice requirements are probably unnecessary for this small app. [Apache-2.0 text](https://apache.org/licenses/LICENSE-2.0.html) |
| **GPL-3.0-only** | People may charge for copies and related services. | When distributing a covered modified version, provide its corresponding source under GPL terms and preserve recipients’ redistribution rights. GPL does not generally require publishing private modifications or server-side changes merely because they are used internally. A web PWA also delivers client-side program copies to users, so distributing its built code has source and license obligations. | **Chosen.** Share-alike matches the owner's goal, and GPLv3 is the version Creative Commons recognizes as compatible with the CC BY-SA 4.0-derived catalog. [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html) |
| **AGPL-3.0** | Like GPL, commercial charging is allowed. | GPL-style distribution conditions, plus users interacting remotely over a network with a modified covered program must be offered that version’s source. GNU explicitly describes interactive web applications as within this network-use case. | Consider only if the owner wants to require source availability for modified hosted versions. This is a stronger condition than the stated broad-reuse goal. [AGPL text](https://www.gnu.org/licenses/agpl-3.0.html) · [GNU guidance on applying licenses](https://www.gnu.org/licenses/gpl-howto.html) |

## Recommendation

The selected license is **GPL-3.0-only**: it allows reuse and commercial charging while requiring distributed modified versions to remain under GPLv3 with corresponding source. A portfolio website itself does not require an open source license. If preventing a hosted modified version from withholding its source were central, AGPL-3.0 would add a network-use source offer, while still permitting commercial charging.

Apache-2.0 is also permissive and commercially usable, but its patent terms and distribution notices add conditions without an apparent need in this project. MIT does not grant trademark rights, require attribution in a portfolio credit, or prevent someone from charging for a copy; its notice condition and warranty disclaimer are the relevant practical points. [MIT text](https://opensource.org/license/mit)

## Caveats

- A license applies only to material the owner has the right to license. Check third-party fonts, kana or other datasets, icons, and dependencies separately; their licenses may impose their own terms.
- Decide whether the license covers only source code or also documentation, artwork, and other assets. A root `LICENSE` file should state the copyright holder and year and make the covered material clear.
- This is a practical comparison, not jurisdiction-specific legal advice. GNU’s license guidance emphasizes including an explicit notice that identifies the license and the covered program; a license file on its own can leave ambiguity about what it covers. [GNU: How to use GNU licenses](https://www.gnu.org/licenses/gpl-howto.html) · [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html)

## Compatibility check for the kanji catalog and GPL-3.0-only

The committed catalog and its generator explicitly state that the generated meanings/readings catalog is derived from KANJIDIC2 under **CC BY-SA 4.0**; the JLPT level/order list is separately attributed as **CC BY**. [Generator source](../../scripts/gen-kanji.py) · [Generated catalog header](../../src/domain/kanji.ts)

GNU and Creative Commons both identify a narrow, one-way compatibility path for adaptations of **CC BY-SA 4.0**: the adapter may license its contributions under **GPL version 3**. This does not authorize GPL-3.0-or-later as an unrestricted choice of any future GPL version. GNU explicitly says that an adapted BY-SA work cannot be licensed “GPL version 3, or ... any later version” on this compatibility basis. [CC’s compatible-license list](https://creativecommons.org/compatible-licenses/) · [GNU license list](https://www.gnu.org/licenses/license-list.html#ccbysa)

The JLPT list is identified by Jonathan Waller as Creative Commons “BY,” but his sharing page does not state a version. Do not label it CC BY 4.0 without further evidence. Preserve the required attribution; the license-version limitation described above is specifically confirmed for KANJIDIC2's CC BY-SA 4.0 data. [Waller's sharing terms](https://www.tanos.co.uk/jlpt/sharing/) · [GNU license list](https://www.gnu.org/licenses/license-list.html#ccby)

GNU describes two ways to address the BY-SA issue:

1. License the combined work under **GPL-3.0-only**. This is the simplest clear compatibility route, but changes the confirmed “or later” choice.
2. Keep GPL-3.0-or-later for the project while explicitly naming **Creative Commons as the GPL version proxy** for the BY-SA-derived combined work. GNU says GPLv3 section 14 permits this, and CC’s compatibility page describes its future-version approval role. Until CC declares a later GPL version compatible, GPLv3 is the available compatible version for the derived material. The relevant notices need to state the proxy arrangement; a bare GPL-3.0-or-later label does not express it. [GNU compatibility guidance](https://www.gnu.org/licenses/license-compatibility.en.html) · [GPLv3 §14](https://www.gnu.org/licenses/gpl-3.0.en.html) · [CC compatibility considerations](https://wiki.creativecommons.org/wiki/ShareAlike_compatibility%3A_GPLv3)

**Decision:** the owner chose GPL-3.0-only for the combined project, avoiding the additional GPLv3 §14 proxy arrangement. The app now includes a dedicated Sources screen reachable from Settings with EDRDG/KANJIDIC2 and JLPT-list credits and license links. The catalog generator and generated header retain the upstream attribution and state the GPLv3 compatibility choice. This is a compatibility assessment, not legal advice.

EDRDG's own terms require acknowledgment of KANJIDIC2 and its source in documentation and, for smartphone and tablet apps, on a separate screen reached from a menu. The in-app Sources screen and README now provide that acknowledgment and links to the source and license terms. [EDRDG license statement](https://www.edrdg.org/edrdg/licence.html)
