/**
 * PDF Studio - PDF Loader, Group Splitter & JSZip Export Engine (v1.0.0)
 * Handles PDF decomposition, high-res canvas thumbnail rendering,
 * zero-restriction silent cleaning, and group-based split PDF ZIP packaging.
 */

const PdfLoader = {
  initialized: false,

  init() {
    if (this.initialized) return;
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.min.js';
      this.initialized = true;
    }
  },

  /**
   * PDF 파일 로드 및 페이지별 분해 렌더링
   * @param {File} file 
   * @param {Function} onProgress 
   * @returns {Promise<Array>} 페이지 객체 배열
   */
  async loadPdf(file, onProgress = null) {
    this.init();
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
    }

    const arrayBuffer = await file.arrayBuffer();
    // 암호화된 문서도 로드 시도 (열람 암호가 없는 보안 플래그 문서 자동 처리)
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: './libs/',
      cMapPacked: true
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;
    const results = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // 썸네일 크기 최적화 (폭/높이 최대 380px)
        const maxDim = 380;
        const scale = maxDim / Math.max(unscaledViewport.width, unscaledViewport.height);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({
          canvasContext: ctx,
          viewport: viewport
        }).promise;

        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);

        results.push({
          id: 'pdf_' + Date.now() + '_' + pageNum + '_' + Math.random().toString(36).substr(2, 6),
          type: 'pdf',
          originFileName: file.name,
          originFileModified: file.lastModified || Date.now(),
          originalIndex: pageNum,
          rotation: 0,
          groupId: 'unassigned',
          thumbnailUrl: thumbnailUrl,
          width: Math.round(unscaledViewport.width),
          height: Math.round(unscaledViewport.height),
          pdfArrayBuffer: arrayBuffer,
          pageIndexInDoc: pageNum - 1 // 0-based
        });
      } catch (pageErr) {
        console.error(`PDF 페이지 렌더링 실패: p.${pageNum}`, pageErr);
      }

      if (typeof onProgress === 'function') {
        onProgress(pageNum, totalPages, file.name);
      }
    }

    return results;
  },

  /**
   * 삼성노트 호환 무음 보안 해제 및 클린 PDF 내보내기 파이프라인
   * 원본의 Encrypt 딕셔너리를 완전히 배제하고 새 문서에 페이지만 복제 삽입
   * @param {Array} pages - 내보낼 페이지 객체 목록
   * @param {Object} metadata - 문서 메타데이터 (title, author, subject, keywords)
   * @param {string} paperFit - 'fit_a4' | 'original'
   * @param {boolean} coverFullBleed - 표지 여백 없이 채우기 여부
   * @returns {Promise<Uint8Array>} 정제된 순수 표준 PDF 바이너리
   */
  async buildCleanPdf(pages, metadata = {}, paperFit = 'fit_a4', coverFullBleed = true, onProgress = null) {
    if (!window.PDFLib) {
      throw new Error('PDF-Lib 라이브러리가 로드되지 않았습니다.');
    }

    const { PDFDocument, rgb, degrees } = PDFLib;
    // 1. 완전히 깨끗한 새 PDFDocument 생성 (암호화 딕셔너리 원천 박멸)
    const cleanPdf = await PDFDocument.create();

    // 메타데이터 주입
    if (metadata.title) cleanPdf.setTitle(metadata.title);
    if (metadata.author) cleanPdf.setAuthor(metadata.author);
    if (metadata.subject) cleanPdf.setSubject(metadata.subject);
    if (metadata.keywords) {
      const kw = metadata.keywords.split(',').map(s => s.trim()).filter(Boolean);
      cleanPdf.setKeywords(kw);
    }
    cleanPdf.setProducer('PDF Studio (Clean Standard)');
    cleanPdf.setCreator('PDF Studio In-Browser Engine');

    // PDF 소스 문서 캐시 (동일 원본 파일 중복 파싱 방지)
    const srcDocMap = new Map();

    const total = pages.length;

    for (let i = 0; i < total; i++) {
      const p = pages[i];
      const isCover = (i === 0 && coverFullBleed);

      if (p.type === 'pdf' && p.pdfArrayBuffer) {
        // [PDF 페이지 복제]
        let srcDoc = srcDocMap.get(p.pdfArrayBuffer);
        if (!srcDoc) {
          // ignoreEncryption: true로 권한 제한이 걸린 문서도 안전 우회 로드
          srcDoc = await PDFDocument.load(p.pdfArrayBuffer, { ignoreEncryption: true });
          srcDocMap.set(p.pdfArrayBuffer, srcDoc);
        }

        const [copiedPage] = await cleanPdf.copyPages(srcDoc, [p.pageIndexInDoc]);
        
        // 회전 각도 적용
        if (p.rotation) {
          const currentRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees((currentRotation + p.rotation) % 360));
        }

        cleanPdf.addPage(copiedPage);
      } else {
        // [이미지 페이지 삽입]
        let imgBytes;
        let isPng = false;

        if (p.rawFile) {
          imgBytes = await p.rawFile.arrayBuffer();
          isPng = p.rawFile.type === 'image/png' || p.originFileName.toLowerCase().endsWith('.png');
        } else if (p.thumbnailUrl) {
          // 썸네일 DataURL에서 바이너리 추출
          const resp = await fetch(p.thumbnailUrl);
          imgBytes = await resp.arrayBuffer();
          isPng = p.thumbnailUrl.startsWith('data:image/png');
        }

        let embeddedImage;
        try {
          if (isPng) {
            embeddedImage = await cleanPdf.embedPng(imgBytes);
          } else {
            embeddedImage = await cleanPdf.embedJpg(imgBytes);
          }
        } catch (embedErr) {
          // 포맷 불일치 시 폴백
          try {
            embeddedImage = await cleanPdf.embedPng(imgBytes);
          } catch {
            embeddedImage = await cleanPdf.embedJpg(imgBytes);
          }
        }

        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;

        let pageWidth, pageHeight, drawX = 0, drawY = 0, drawW = imgWidth, drawH = imgHeight;

        if (isCover) {
          // 표지 여백 없이 전면 채우기 (Full Bleed Cover Fit)
          pageWidth = imgWidth;
          pageHeight = imgHeight;
          drawW = imgWidth;
          drawH = imgHeight;
          drawX = 0;
          drawY = 0;
        } else if (['fit_a4', 'fit_b5', 'fit_letter'].includes(paperFit)) {
          // 표준 용지 규격 (pt 단위)
          let stdW = 595.28, stdH = 841.89; // A4
          if (paperFit === 'fit_b5') {
            stdW = 498.90; stdH = 708.66; // B5 (수험서/교재 표준)
          } else if (paperFit === 'fit_letter') {
            stdW = 612.00; stdH = 792.00; // US Letter
          }

          const isLandscape = imgWidth > imgHeight;
          pageWidth = isLandscape ? stdH : stdW;
          pageHeight = isLandscape ? stdW : stdH;

          // 20pt 안전 여백 적용
          const margin = 20;
          const availW = pageWidth - margin * 2;
          const availH = pageHeight - margin * 2;

          const scaleRatio = Math.min(availW / imgWidth, availH / imgHeight);
          drawW = imgWidth * scaleRatio;
          drawH = imgHeight * scaleRatio;
          drawX = (pageWidth - drawW) / 2;
          drawY = (pageHeight - drawH) / 2;
        } else {
          // 원본 1:1 픽셀 비율 유지
          pageWidth = imgWidth;
          pageHeight = imgHeight;
          drawW = imgWidth;
          drawH = imgHeight;
          drawX = 0;
          drawY = 0;
        }

        const newPage = cleanPdf.addPage([pageWidth, pageHeight]);
        
        // 사용자 회전 적용
        if (p.rotation) {
          newPage.setRotation(degrees(p.rotation % 360));
        }

        newPage.drawImage(embeddedImage, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH
        });
      }

      if (typeof onProgress === 'function') {
        onProgress(i + 1, total);
      }
    }

    // 2. Encrypt 딕셔너리가 전무한 순수 표준 PDF 바이너리 저장
    const cleanPdfBytes = await cleanPdf.save();
    return cleanPdfBytes;
  },

  /**
   * 파일명에 사용할 수 없는 특수문자 정제
   */
  sanitizeFileName(name) {
    if (!name) return 'document';
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  },

  /**
   * 브라우저 파일 다운로드 트리거 (PDF)
   */
  downloadPdf(pdfBytes, defaultName = 'PDF_Studio_Document.pdf') {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultName.endsWith('.pdf') ? defaultName : defaultName + '.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  },

  /**
   * 브라우저 파일 다운로드 트리거 (ZIP)
   */
  downloadZip(zipBlob, defaultName = 'PDF_Studio_Groups.zip') {
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultName.endsWith('.zip') ? defaultName : defaultName + '.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  },

  /**
   * 그룹별 독립 PDF 빌드 및 JSZip 일괄 압축 내보내기 엔진
   * @param {Object} options
   *   - groups: 전체 그룹 배열
   *   - pages: 전체 페이지 배열
   *   - metadata: 공통 메타데이터 객체 (title, author, subject, keywords)
   *   - paperFit: 용지 규격 ('fit_a4', 'fit_b5', 'fit_letter', 'original')
   *   - coverFullBleed: 첫 페이지 표지 전면 채우기 여부
   * @param {Function} onProgress: 진행 콜백 ({ phase, current, total, percent, groupName })
   */
  async exportGroupsToZip(options, onProgress = null) {
    if (!window.JSZip) {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
    }

    const { groups, pages, metadata = {}, paperFit = 'fit_a4', coverFullBleed = true } = options;
    if (!pages || pages.length === 0) {
      throw new Error('내보낼 페이지가 없습니다.');
    }

    // 페이지가 존재하는 유효 그룹만 선별 (순서 보존)
    const validGroups = groups.filter(g => pages.some(p => p.groupId === g.id));
    if (validGroups.length === 0) {
      throw new Error('내보낼 그룹 페이지가 없습니다.');
    }

    const zip = new JSZip();
    const baseTitle = metadata.title || 'PDF_Studio_Document';
    const totalGroups = validGroups.length;

    for (let i = 0; i < totalGroups; i++) {
      const g = validGroups[i];
      const groupPages = pages.filter(p => p.groupId === g.id);

      if (typeof onProgress === 'function') {
        const buildPercent = Math.round((i / totalGroups) * 70);
        onProgress({
          phase: 'building',
          current: i + 1,
          total: totalGroups,
          groupName: g.name,
          percent: buildPercent
        });
      }

      // 그룹 전용 메타데이터 (제목: [문서제목] - [그룹이름])
      const groupDocTitle = `${baseTitle} - ${g.name}`;
      const groupMetadata = {
        ...metadata,
        title: groupDocTitle
      };

      // 독립 클린 PDF 생성
      const groupPdfBytes = await this.buildCleanPdf(
        groupPages,
        groupMetadata,
        paperFit,
        coverFullBleed
      );

      // 파일명 정제 후 ZIP 파일 트리에 추가
      const cleanFileName = this.sanitizeFileName(groupDocTitle) + '.pdf';
      zip.file(cleanFileName, groupPdfBytes);
    }

    // JSZip 비동기 압축 실행 (레벨 6 DEFLATE)
    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'compressing',
        current: totalGroups,
        total: totalGroups,
        percent: 70,
        groupName: '전체 그룹'
      });
    }

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      (zipMeta) => {
        if (typeof onProgress === 'function') {
          // 압축 구간은 70% ~ 100% 비율로 매핑
          const overallPercent = 70 + Math.round(zipMeta.percent * 0.3);
          onProgress({
            phase: 'compressing',
            current: totalGroups,
            total: totalGroups,
            percent: Math.min(overallPercent, 99),
            groupName: 'ZIP 압축 중'
          });
        }
      }
    );

    const zipFileName = this.sanitizeFileName(`${baseTitle}_그룹분할`) + '.zip';
    this.downloadZip(zipBlob, zipFileName);

    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'done',
        current: totalGroups,
        total: totalGroups,
        percent: 100,
        groupName: '완료'
      });
    }

    return {
      groupCount: totalGroups,
      zipFileName
    };
  },

  /**
   * 단일 그룹 단독 PDF 즉시 내보내기
   */
  async exportSingleGroup(group, options, onProgress = null) {
    const { pages, metadata = {}, paperFit = 'fit_a4', coverFullBleed = true } = options;
    const groupPages = pages.filter(p => p.groupId === group.id);

    if (groupPages.length === 0) {
      throw new Error(`'${group.name}' 그룹에 속한 페이지가 없습니다.`);
    }

    const baseTitle = metadata.title || 'PDF_Studio_Document';
    const groupDocTitle = `${baseTitle} - ${group.name}`;
    const groupMetadata = {
      ...metadata,
      title: groupDocTitle
    };

    const groupPdfBytes = await this.buildCleanPdf(
      groupPages,
      groupMetadata,
      paperFit,
      coverFullBleed,
      onProgress
    );

    const fileName = this.sanitizeFileName(groupDocTitle) + '.pdf';
    this.downloadPdf(groupPdfBytes, fileName);

    return {
      pageCount: groupPages.length,
      fileName
    };
  }
};
