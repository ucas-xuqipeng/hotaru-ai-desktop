# FFmpeg source and license information

The bundled ffmpeg/ffprobe report FFmpeg `n4.3.2-160-gfbb9368226`, LGPL version 3 or later. They are invoked as separate command-line programs. Their original license notice and configuration are retained in FFmpeg-LICENSE.txt and FFmpeg-build.txt. Full license texts are in COPYING.LGPLv3 and COPYING.GPLv3.

Reported FFmpeg revision, resolved against the official source repository: `fbb9368226d693c99d9b0aee672c59ed1a36785b`.

- Source: https://github.com/FFmpeg/FFmpeg/tree/fbb9368226d693c99d9b0aee672c59ed1a36785b
- Exact pinned source archive: https://codeload.github.com/FFmpeg/FFmpeg/zip/fbb9368226d693c99d9b0aee672c59ed1a36785b
- A copy is distributed alongside this application's Release as `FFmpeg-source-fbb9368226.zip`.
- FFmpeg licensing information: https://ffmpeg.org/legal.html

The version/build configuration corresponds to the historical BtbN Windows LGPL builds. Build recipe reference from the 2021-02-28 distribution period:

- https://github.com/BtbN/FFmpeg-Builds/tree/791b9eade111fe6ab2052afb50afe427ec949357
- Recipe snapshot is also included in the Release as `FFmpeg-Builds-source-20210228.zip`; dependency source URLs and build scripts are retained there.

This project did not modify these FFmpeg executables or link its own application code into them. The original compiler environment was not rebuilt, and the recipe snapshot is a historical build reference rather than a claim of a byte-identical reconstruction. Other third-party libraries retain their own terms. FFmpeg can be replaced by a compatible build by replacing the bundled ffmpeg/ffprobe files.
