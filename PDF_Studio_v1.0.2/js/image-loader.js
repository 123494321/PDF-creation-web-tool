/**
 * PDF Studio - Image Loader & Natural Sort Engine (v1.0.2)
 * Handles bulk image processing, zero-jumble pre-allocated slots,
 * natural alphanumeric sorting, and memory-safe thumbnail downsampling.
 */

const ImageLoader = {
  // 지원 확장자 및 MIME 타입
  supportedTypes: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'
  ],
  supportedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'],

  // 자연어 정렬 비교기 (1, 2, ... 10)
  naturalCollator: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),

  isImageFile(file) {
    if (!file) return false;
    if (file.type && this.supportedTypes.includes(file.type.toLowerCase())) {
      return true;
    }
    const name = file.name.toLowerCase();
    return this.supportedExtensions.some(ext => name.endsWith(ext));
  },

  /**
   * 대량 이미지 일괄 로드 및 자연어 순서 보정
   * @param {FileList|File[]} files - 입력 파일 목록
   * @param {Function} onProgress - 진행률 콜백 (loaded, total, currentFileName)
   * @returns {Promise<Array>} 페이지 객체 배열
   */
  async loadFiles(files, onProgress = null) {
    const rawList = Array.from(files).filter(f => this.isImageFile(f));
    if (rawList.length === 0) return [];

    // [핵심 1] 자연어 정렬 선제 적용 (파일명 기반)
    rawList.sort((a, b) => this.naturalCollator.compare(a.name, b.name));

    const total = rawList.length;
    // [핵심 2] 비동기 속도 차이로 인한 순서 역전 원천 차단: 고정 슬롯 배열 선점
    const results = new Array(total);
    let loadedCount = 0;

    // 동시 처리 동시성 제어 (메모리 및 UI 렌더링 스레드 부하 분산)
    const concurrency = 4;
    let nextIndex = 0;

    const processItem = async (index) => {
      const file = rawList[index];
      try {
        const thumb = await this.createThumbnail(file, 400);
        results[index] = {
          id: 'img_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 6),
          originFileName: file.name,
          originFileModified: file.lastModified || Date.now(),
          originalIndex: index + 1,
          rotation: 0,
          groupId: 'unassigned',
          thumbnailUrl: thumb.thumbnailUrl,
          width: thumb.width,
          height: thumb.height,
          rawFile: file // 고용량 원본은 Blob 레퍼런스로 보존 (메모리 절약)
        };
      } catch (err) {
        console.error(`이미지 변환 실패: ${file.name}`, err);
        // 실패 시 폴백 더미 카드
        results[index] = {
          id: 'img_err_' + Date.now() + '_' + index,
          originFileName: file.name + ' (로드 실패)',
          originFileModified: file.lastModified || Date.now(),
          originalIndex: index + 1,
          rotation: 0,
          groupId: 'unassigned',
          thumbnailUrl: this.createErrorThumbnail(file.name),
          width: 400,
          height: 560,
          rawFile: file
        };
      } finally {
        loadedCount++;
        if (typeof onProgress === 'function') {
          onProgress(loadedCount, total, file.name);
        }
      }
    };

    // 워커 풀 방식 실행
    const workers = [];
    for (let w = 0; w < Math.min(concurrency, total); w++) {
      const worker = async () => {
        while (nextIndex < total) {
          const currentIndex = nextIndex++;
          await processItem(currentIndex);
        }
      };
      workers.push(worker());
    }

    await Promise.all(workers);
    return results.filter(Boolean);
  },

  /**
   * 메모리 보호 썸네일 다운샘플링 (Canvas 기반)
   * @param {File} file 
   * @param {number} maxDimension 
   * @returns {Promise<{thumbnailUrl: string, width: number, height: number}>}
   */
  createThumbnail(file, maxDimension = 400) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          const originWidth = img.naturalWidth || img.width;
          const originHeight = img.naturalHeight || img.height;

          // 비율 유지 축소 크기 계산
          let targetWidth = originWidth;
          let targetHeight = originHeight;

          if (originWidth > originHeight) {
            if (originWidth > maxDimension) {
              targetHeight = Math.round((originHeight * maxDimension) / originWidth);
              targetWidth = maxDimension;
            }
          } else {
            if (originHeight > maxDimension) {
              targetWidth = Math.round((originWidth * maxDimension) / originHeight);
              targetHeight = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          // 이미지 스무딩 품질 극대화 및 투명 PNG 검은색 반전 방지 (흰색 종이 바탕)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(objectUrl);

          resolve({
            thumbnailUrl,
            width: originWidth,
            height: originHeight
          });
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };

      img.src = objectUrl;
    });
  },

  createErrorThumbnail(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 560;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fee2e2';
    ctx.fillRect(0, 0, 400, 560);
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ 로드 실패', 200, 260);
    ctx.font = '14px sans-serif';
    ctx.fillText(name.slice(0, 20), 200, 300);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
};
