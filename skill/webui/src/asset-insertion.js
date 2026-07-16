const CLASS_RE = /<!--\s*_class:\s*([^>]*?)\s*-->/;
const IMAGE_RE = /!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)([^)]*)\)/;
const IMAGE_GLOBAL_RE = new RegExp(IMAGE_RE.source, 'g');

export const slideCls = (raw) => (raw.match(CLASS_RE)?.[1] ?? '').trim();

// raw 内の _class 行だけを書き換える(他は一切触らない)
export function setSlideCls(raw, cls) {
  if (CLASS_RE.test(raw)) {
    if (cls) return raw.replace(CLASS_RE, `<!-- _class: ${cls} -->`);
    const lines = raw.split('\n');
    const index = lines.findIndex((line) => CLASS_RE.test(line));
    lines.splice(index, 1);
    return lines.join('\n');
  }
  if (!cls) return raw;
  const lines = raw.split('\n');
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  lines.splice(index, 0, `<!-- _class: ${cls} -->`, '');
  return lines.join('\n');
}

const isBackgroundAlt = (alt) => /^\s*bg(?:\s|$)/i.test(alt);

function findImage(raw, predicate = () => true) {
  for (const match of raw.matchAll(IMAGE_GLOBAL_RE)) {
    if (predicate(match[1], match)) return match;
  }
  return null;
}

function replaceImage(raw, match, imagePath, alt) {
  const [full, currentAlt, _currentPath, suffix] = match;
  const nextAlt = alt || currentAlt || 'スライドの図版';
  const replacement = `![${nextAlt}](${imagePath}${suffix})`;
  return `${raw.slice(0, match.index)}${replacement}${raw.slice(match.index + full.length)}`;
}

/** ライブラリ素材を挿入し、通常画像では素材に対応したaltへ同時に更新する。 */
export function setFirstImage(raw, imagePath, alt) {
  const first = findImage(raw);
  if (first) {
    // Marp の背景指定はalt欄に書くディレクティブなので、その指定自体を保持する。
    return replaceImage(raw, first, imagePath, isBackgroundAlt(first[1]) ? first[1] : alt);
  }
  if (slideCls(raw).split(/\s+/)[0] === 'title') {
    return `![bg right:44% cover](${imagePath})\n\n${setSlideCls(raw, 'title-visual').trimStart()}`;
  }
  return `${setSlideCls(raw, 'image-right').trimEnd()}\n\n![${alt || 'スライドの図版'}](${imagePath})\n`;
}

/** 素材種別に応じて、背景・アイコン・写真を壊れにくいMarkdown構造へ挿入する。 */
export function setLibraryAsset(raw, imagePath, asset = {}) {
  const alt = asset.alt || 'スライドの図版';

  if (asset.kind === 'background') {
    const background = findImage(raw, isBackgroundAlt);
    if (background) return replaceImage(raw, background, imagePath, background[1]);
    return `![bg cover](${imagePath})\n\n${raw.trimStart()}`;
  }

  if (asset.kind === 'icon') {
    if (slideCls(raw).split(/\s+/)[0] === 'cards') {
      const cardIcon = findImage(raw, (_currentAlt, match) => {
        const lineStart = raw.lastIndexOf('\n', match.index) + 1;
        return /^\s*-\s*$/.test(raw.slice(lineStart, match.index));
      });
      if (cardIcon) return replaceImage(raw, cardIcon, imagePath, alt);

      const firstCard = raw.match(/^(\s*-\s+)(?!\!\[)(.+)$/m);
      if (firstCard) {
        return raw.replace(firstCard[0], `${firstCard[1]}![${alt}](${imagePath}) ${firstCard[2]}`);
      }
    }

    const ordinary = findImage(raw, (currentAlt) => !isBackgroundAlt(currentAlt));
    if (ordinary) return replaceImage(raw, ordinary, imagePath, `w:280 ${alt}`);
    return `${setSlideCls(raw, 'image-right').trimEnd()}\n\n![w:280 ${alt}](${imagePath})\n`;
  }

  return setFirstImage(raw, imagePath, alt);
}
