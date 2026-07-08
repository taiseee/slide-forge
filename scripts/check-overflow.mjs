#!/usr/bin/env node
/*
 * check-overflow.mjs — Marp ビルド済み HTML の各スライドについて、
 * コンテンツのはみ出し(縦・横・絶対配置要素の枠外突出)を検出する。
 *
 * CLI:  node scripts/check-overflow.mjs <slides.html>
 *       終了コード: 0 = 問題なし / 1 = はみ出しあり / 2 = 使い方エラー
 * API:  import { checkOverflow } from './check-overflow.mjs'
 *       const issues = await checkOverflow('slides.html')  // [] なら問題なし
 */

import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

export async function checkOverflow(file) {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(file)).href, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    return await page.evaluate(() => {
      const TOL = 3; // px 許容誤差
      const results = [];
      // Marp CLI 出力ではスライドは svg[data-marpit-svg] > foreignObject > section
      let targets = [...document.querySelectorAll('svg[data-marpit-svg] > foreignObject > section')];
      if (targets.length === 0) {
        // フォールバック: 最外殻の section のみ対象
        targets = [...document.querySelectorAll('section')].filter(
          (s) => !s.parentElement?.closest('section'),
        );
      }

      targets.forEach((s, i) => {
        const slideNo = i + 1;
        const problems = [];

        // 1) 通常フローのはみ出し(overflow: hidden でも scrollHeight で検出可能)
        const dv = s.scrollHeight - s.clientHeight;
        const dh = s.scrollWidth - s.clientWidth;
        if (dv > TOL) problems.push(`縦はみ出し ${dv}px`);
        if (dh > TOL) problems.push(`横はみ出し ${dh}px`);

        // 2) 絶対配置要素など、境界ボックスがスライド枠を超える要素
        const rect = s.getBoundingClientRect();
        const scale = rect.width / s.clientWidth || 1;
        const tol = TOL * scale;
        for (const el of s.querySelectorAll('*')) {
          // 不可視要素(KaTeX の MathML 部など、クリップされた補助要素)は対象外
          if (el.closest('.katex-mathml') !== null) continue;
          if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const out = [];
          if (r.top < rect.top - tol) out.push('上');
          if (r.bottom > rect.bottom + tol) out.push('下');
          if (r.left < rect.left - tol) out.push('左');
          if (r.right > rect.right + tol) out.push('右');
          if (out.length > 0) {
            const tag = el.tagName.toLowerCase();
            const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
            problems.push(`要素 <${tag}${cls}> が枠外(${out.join('/')})`);
            break; // スライドごとに最初の1件で十分
          }
        }

        if (problems.length > 0) {
          results.push({ slide: slideNo, class: s.className || '(none)', problems });
        }
      });
      return results;
    });
  } finally {
    await browser.close();
  }
}

const isCli =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/check-overflow.mjs <slides.html>');
    process.exit(2);
  }
  const issues = await checkOverflow(file);
  if (issues.length === 0) {
    console.log('OK: 全スライドではみ出しなし');
  } else {
    console.log(`NG: ${issues.length} 枚のスライドではみ出しを検出`);
    for (const it of issues) {
      console.log(`  slide ${it.slide} [${it.class}]: ${it.problems.join(', ')}`);
    }
    process.exitCode = 1;
  }
}
