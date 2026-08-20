#!/bin/sh

set -eu

NODE_VERSION="20.20.0"
NODE_SHA256="5294d9d2915620e819e6892fd7e545b98d650bad36dae54e6527eaac482add98"
FFMPEG_VERSION="7.1.2"
FFMPEG_SHA256="089bc60fb59d6aecc5d994ff530fd0dcb3ee39aa55867849a2bbc4e555f9c304"
PYTHON_VERSION="3.11.14"
PYTHON_SHA256="8d3ed8ec5c88c1c95f5e558612a725450d2452813ddad5e58fdb1a53b1209b78"
YTDLP_VERSION="2026.8.19"
YTDLP_WHEEL_SHA256="1d57897e94c6665a0a6f9bc54b34e584284e32c034ffab3a7df25d8f7b24eedf"
# Sakura's shared-host memory limit can kill V8's largest C++ files when two
# compiler processes overlap. One job is slower but repeatable on this host.
JOBS="${JOBS:-1}"
FORCE_FFMPEG_REBUILD="${FORCE_FFMPEG_REBUILD:-0}"
FORCE_PYTHON_REBUILD="${FORCE_PYTHON_REBUILD:-0}"
HOME_DIR="${HOME}"
SOURCE_DIR="${HOME_DIR}/src"
TMP_BUILD_DIR="${HOME_DIR}/tmp-build"
NODE_PREFIX="${HOME_DIR}/.local-node20"
FFMPEG_PREFIX="${HOME_DIR}/.local-ffmpeg"
PYTHON_PREFIX="${HOME_DIR}/.local-python311"
OPENSSL_SHIM_PREFIX="${HOME_DIR}/.local-freebsd-openssl"

mkdir -p \
  "${SOURCE_DIR}" \
  "${TMP_BUILD_DIR}" \
  "${NODE_PREFIX}" \
  "${FFMPEG_PREFIX}" \
  "${PYTHON_PREFIX}" \
  "${OPENSSL_SHIM_PREFIX}/include" \
  "${OPENSSL_SHIM_PREFIX}/lib"
ln -sfn /usr/include/openssl "${OPENSSL_SHIM_PREFIX}/include/openssl"
ln -sfn /usr/lib/libssl.so.111 "${OPENSSL_SHIM_PREFIX}/lib/libssl.so"
ln -sfn /lib/libcrypto.so.111 "${OPENSSL_SHIM_PREFIX}/lib/libcrypto.so"

download_and_verify() {
  url="$1"
  output="$2"
  expected="$3"
  if [ ! -f "${output}" ]; then
    fetch -o "${output}" "${url}"
  fi
  actual="$(sha256 -q "${output}")"
  if [ "${actual}" != "${expected}" ]; then
    echo "Checksum mismatch: ${output}" >&2
    exit 1
  fi
}

if [ ! -x "${NODE_PREFIX}/bin/node" ]; then
  node_archive="${SOURCE_DIR}/node-v${NODE_VERSION}.tar.xz"
  node_source="${SOURCE_DIR}/node-v${NODE_VERSION}"
  download_and_verify \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.xz" \
    "${node_archive}" \
    "${NODE_SHA256}"
  if [ ! -d "${node_source}" ]; then
    tar -xJf "${node_archive}" -C "${SOURCE_DIR}"
  fi
  cd "${node_source}"
  env CC=/usr/bin/clang CXX=/usr/bin/clang++ \
    ./configure --prefix="${NODE_PREFIX}"
  /usr/bin/nice -n 10 gmake -j"${JOBS}"
  gmake install
fi

if [ "${FORCE_FFMPEG_REBUILD}" = "1" ] || [ ! -x "${FFMPEG_PREFIX}/bin/ffmpeg" ]; then
  ffmpeg_archive="${SOURCE_DIR}/ffmpeg-${FFMPEG_VERSION}.tar.xz"
  ffmpeg_source="${SOURCE_DIR}/ffmpeg-${FFMPEG_VERSION}"
  download_and_verify \
    "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
    "${ffmpeg_archive}" \
    "${FFMPEG_SHA256}"
  if [ ! -d "${ffmpeg_source}" ]; then
    tar -xJf "${ffmpeg_archive}" -C "${SOURCE_DIR}"
  fi
  cd "${ffmpeg_source}"
  gmake distclean >/dev/null 2>&1 || true
  env \
    CC=/usr/bin/clang \
    CXX=/usr/bin/clang++ \
    LD=/usr/bin/ld \
    TMPDIR="${TMP_BUILD_DIR}" \
    ./configure \
    --prefix="${FFMPEG_PREFIX}" \
    --cc=/usr/bin/clang \
    --cxx=/usr/bin/clang++ \
    --ld=/usr/bin/clang \
    --pkg-config=false \
    --extra-cflags=-I/usr/include \
    --extra-ldflags=-L/usr/lib \
    --disable-everything \
    --disable-debug \
    --disable-doc \
    --disable-ffplay \
    --disable-ffprobe \
    --disable-shared \
    --enable-static \
    --disable-x86asm \
    --disable-autodetect \
    --enable-openssl \
    --enable-network \
    --enable-protocol=file,pipe,http,https,tcp,tls,crypto \
    --enable-demuxer=matroska,mov,ogg,mp3,wav,flac,aac \
    --enable-muxer=wav,pcm_f32le,matroska,webm,mp4,adts,ogg \
    --enable-decoder=aac,aac_fixed,aac_latm,opus,vorbis,mp3,mp3float,flac,alac,pcm_s16le,pcm_s16be,pcm_f32le,pcm_f32be \
    --enable-encoder=pcm_s16le,pcm_f32le \
    --enable-parser=aac,aac_latm,opus,vorbis,mpegaudio,flac \
    --enable-bsf=aac_adtstoasc,opus_metadata \
    --enable-filter=aresample,aformat,anull \
    --enable-swresample \
    --enable-avfilter
  /usr/bin/nice -n 10 gmake -j"${JOBS}"
  gmake install
fi

if [ "${FORCE_PYTHON_REBUILD}" = "1" ] || [ ! -x "${PYTHON_PREFIX}/bin/python3.11" ]; then
  python_archive="${SOURCE_DIR}/Python-${PYTHON_VERSION}.tar.xz"
  python_source="${SOURCE_DIR}/Python-${PYTHON_VERSION}"
  download_and_verify \
    "https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tar.xz" \
    "${python_archive}" \
    "${PYTHON_SHA256}"
  if [ ! -d "${python_source}" ]; then
    tar -xJf "${python_archive}" -C "${SOURCE_DIR}"
  fi
  cd "${python_source}"
  gmake distclean >/dev/null 2>&1 || true
  env \
    CC=/usr/bin/clang \
    CXX=/usr/bin/clang++ \
    CPPFLAGS="-I${OPENSSL_SHIM_PREFIX}/include" \
    LDFLAGS="-L${OPENSSL_SHIM_PREFIX}/lib" \
    PKG_CONFIG=/usr/bin/false \
    TMPDIR="${TMP_BUILD_DIR}" \
    ./configure \
      --prefix="${PYTHON_PREFIX}" \
      --with-openssl="${OPENSSL_SHIM_PREFIX}" \
      --with-openssl-rpath=no \
      --with-ensurepip=install
  /usr/bin/nice -n 10 gmake -j"${JOBS}"
  gmake install
fi

ytdlp_wheel="${SOURCE_DIR}/yt_dlp-${YTDLP_VERSION}-py3-none-any.whl"
download_and_verify \
  "https://files.pythonhosted.org/packages/69/b2/8cd1613f56eed7ceb64fbd4df3f1c01246bfb098e6f398228bafda22b80b/yt_dlp-${YTDLP_VERSION}-py3-none-any.whl" \
  "${ytdlp_wheel}" \
  "${YTDLP_WHEEL_SHA256}"
installed_ytdlp="$(${PYTHON_PREFIX}/bin/python3.11 -m yt_dlp --version 2>/dev/null || true)"
if [ "${installed_ytdlp}" != "${YTDLP_VERSION}" ]; then
  "${PYTHON_PREFIX}/bin/python3.11" -m pip install \
    --disable-pip-version-check \
    --no-deps \
    --force-reinstall \
    "${ytdlp_wheel}"
fi

mkdir -p "${HOME_DIR}/bin"
ln -sf "${NODE_PREFIX}/bin/node" "${HOME_DIR}/bin/node"
ln -sf "${NODE_PREFIX}/bin/npm" "${HOME_DIR}/bin/npm"
ln -sf "${NODE_PREFIX}/bin/npx" "${HOME_DIR}/bin/npx"
ln -sf "${NODE_PREFIX}/bin/corepack" "${HOME_DIR}/bin/corepack"
ln -sf "${FFMPEG_PREFIX}/bin/ffmpeg" "${HOME_DIR}/bin/ffmpeg"
ln -sf "${PYTHON_PREFIX}/bin/python3.11" "${HOME_DIR}/bin/python3.11"
ln -sf "${PYTHON_PREFIX}/bin/python3.11" "${HOME_DIR}/bin/python3"
ln -sf "${PYTHON_PREFIX}/bin/pip3.11" "${HOME_DIR}/bin/pip3"
ln -sf "${PYTHON_PREFIX}/bin/yt-dlp" "${HOME_DIR}/bin/yt-dlp"

"${NODE_PREFIX}/bin/node" --version
"${FFMPEG_PREFIX}/bin/ffmpeg" -version | sed -n '1p'
"${PYTHON_PREFIX}/bin/python3.11" --version
"${PYTHON_PREFIX}/bin/python3.11" -m yt_dlp --version
