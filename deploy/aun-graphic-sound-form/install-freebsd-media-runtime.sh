#!/bin/sh

set -eu

NODE_VERSION="20.20.0"
NODE_SHA256="5294d9d2915620e819e6892fd7e545b98d650bad36dae54e6527eaac482add98"
FFMPEG_VERSION="7.1.2"
FFMPEG_SHA256="089bc60fb59d6aecc5d994ff530fd0dcb3ee39aa55867849a2bbc4e555f9c304"
# Sakura's shared-host memory limit can kill V8's largest C++ files when two
# compiler processes overlap. One job is slower but repeatable on this host.
JOBS="${JOBS:-1}"
FORCE_FFMPEG_REBUILD="${FORCE_FFMPEG_REBUILD:-0}"
HOME_DIR="${HOME}"
SOURCE_DIR="${HOME_DIR}/src"
TMP_BUILD_DIR="${HOME_DIR}/tmp-build"
NODE_PREFIX="${HOME_DIR}/.local-node20"
FFMPEG_PREFIX="${HOME_DIR}/.local-ffmpeg"

mkdir -p "${SOURCE_DIR}" "${TMP_BUILD_DIR}" "${NODE_PREFIX}" "${FFMPEG_PREFIX}"

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

mkdir -p "${HOME_DIR}/bin"
ln -sf "${NODE_PREFIX}/bin/node" "${HOME_DIR}/bin/node"
ln -sf "${NODE_PREFIX}/bin/npm" "${HOME_DIR}/bin/npm"
ln -sf "${NODE_PREFIX}/bin/npx" "${HOME_DIR}/bin/npx"
ln -sf "${NODE_PREFIX}/bin/corepack" "${HOME_DIR}/bin/corepack"
ln -sf "${FFMPEG_PREFIX}/bin/ffmpeg" "${HOME_DIR}/bin/ffmpeg"

"${NODE_PREFIX}/bin/node" --version
"${FFMPEG_PREFIX}/bin/ffmpeg" -version | sed -n '1p'
