// 프로덕션 빌드 후 http://를 https://로 변경하는 스크립트
// SVG 네임스페이스는 제외

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const DIST_DIR = 'dist';

function replaceHttpToHttps(content) {
  // SVG 네임스페이스를 제외하고 http://를 https://로 변경
  // 패턴: http://www.w3.org로 시작하는 것은 제외, 나머지는 모두 변경
  return content.replace(
    /http:\/\/(?!www\.w3\.org)/g,
    'https://'
  );
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    const newContent = replaceHttpToHttps(content);
    
    if (originalContent !== newContent) {
      writeFileSync(filePath, newContent, 'utf-8');
      const matches = (originalContent.match(/http:\/\//g) || []).length;
      const replaced = (newContent.match(/https:\/\//g) || []).length - (originalContent.match(/https:\/\//g) || []).length;
      console.log(`✅ ${filePath}: ${replaced}개 http:// → https:// 변경`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ ${filePath} 처리 중 오류:`, error.message);
    return false;
  }
}

function walkDir(dir, fileList = []) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else {
      const ext = extname(file).toLowerCase();
      if (ext === '.js' || ext === '.html') {
        fileList.push(filePath);
      }
    }
  }
  
  return fileList;
}

// 메인 실행
console.log('🔍 dist 폴더에서 .js와 .html 파일 검색 중...');
const files = walkDir(DIST_DIR);
console.log(`📁 ${files.length}개 파일 발견\n`);

let changedCount = 0;
for (const file of files) {
  if (processFile(file)) {
    changedCount++;
  }
}

console.log(`\n✨ 완료! ${changedCount}개 파일 수정됨`);

