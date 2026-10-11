/**
 * PDF Studio - Main Controller (v1.0.2)
 * Application entry point, event coordination, drag-and-drop, sample generator,
 * group export & JSZip packaging
 */

document.addEventListener('DOMContentLoaded', () => {
  // UI 초기화
  UI.init();

  // 파일 입력 리스너
  const imageInput = document.getElementById('file-input-image');
  const pdfInput = document.getElementById('file-input-pdf');

  const coverInput = document.getElementById('file-input-cover');

  document.getElementById('btn-add-images').addEventListener('click', () => {
    imageInput.click();
  });

  document.getElementById('btn-add-pdf').addEventListener('click', () => {
    pdfInput.click();
  });

  const btnAddCover = document.getElementById('btn-add-cover');
  if (btnAddCover && coverInput) {
    btnAddCover.addEventListener('click', () => {
      coverInput.click();
    });

    coverInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        try {
          UI.showProgress(0, 1, '표지 이미지 최적화 중...');
          const pages = await ImageLoader.loadFiles([file]);
          if (pages.length > 0) {
            AppState.addCoverPage(pages[0]);
            UI.showToast(`'${file.name}'이 0번(맨 앞) 표지로 성공적으로 삽입되었습니다!`, 'success', 3500);
          }
        } catch (err) {
          console.error('표지 로드 실패:', err);
          UI.showToast('표지 이미지를 불러오는 중 오류가 발생했습니다.', 'error');
        } finally {
          UI.hideProgress();
          coverInput.value = '';
        }
      }
    });
  }

  // 첫 번째 파일명으로 제목 자동완성
  const btnAutofill = document.getElementById('btn-autofill-title');
  if (btnAutofill) {
    btnAutofill.addEventListener('click', () => {
      if (AppState.pages.length === 0) {
        UI.showToast('문서에 추가된 페이지가 없습니다.', 'info');
        return;
      }
      const firstPage = AppState.pages[0];
      let cleanTitle = firstPage.originFileName.replace(/\.[^/.]+$/, ''); // 확장자 제거
      cleanTitle = cleanTitle.replace(/^[\d\s_\-]+/, ''); // 앞쪽 숫자/기호 정리
      if (!cleanTitle) cleanTitle = firstPage.originFileName.replace(/\.[^/.]+$/, '');
      document.getElementById('meta-title').value = cleanTitle;
      UI.showToast(`문서 제목이 '${cleanTitle}'(으)로 자동 완성되었습니다!`, 'success', 2000);
    });
  }

  imageInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files, 'image');
    imageInput.value = '';
  });

  pdfInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files, 'pdf');
    pdfInput.value = '';
  });

  // 드래그 앤 드롭 영역 처리
  const dropTarget = document.getElementById('main-canvas');
  const emptyCard = document.querySelector('.empty-card');

  ['dragenter', 'dragover'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (emptyCard) emptyCard.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (emptyCard) emptyCard.classList.remove('drag-over');
    }, false);
  });

  window.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFilesSelected(dt.files, 'auto');
    }
  });

  async function handleFilesSelected(files, type) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const imageFiles = fileArray.filter(f => ImageLoader.isImageFile(f));
    const pdfFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.pdf') || (f.type && f.type.toLowerCase().includes('pdf')));

    if (imageFiles.length > 0) {
      const startTime = performance.now();
      UI.showProgress(0, imageFiles.length, '자연어 정렬 및 최적화 중...');

      try {
        const newPages = await ImageLoader.loadFiles(imageFiles, (loaded, total, currentName) => {
          UI.showProgress(loaded, total, '이미지 불러오는 중...');
        });

        AppState.addPages(newPages);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        UI.showToast(`${newPages.length}장의 이미지가 순서 꼬임 없이 완벽 정렬되어 추가되었습니다! (${elapsed}초)`, 'success', 3500);
      } catch (err) {
        console.error('이미지 일괄 로드 오류:', err);
        UI.showToast('일부 이미지를 불러오는 중 오류가 발생했습니다.', 'error');
      } finally {
        UI.hideProgress();
      }
    }

    if (pdfFiles.length > 0) {
      for (const pdfFile of pdfFiles) {
        const startTime = performance.now();
        UI.showProgress(0, 100, `PDF 파싱 중: ${pdfFile.name}`);

        try {
          const pdfPages = await PdfLoader.loadPdf(pdfFile, (current, total, name) => {
            UI.showProgress(current, total, `PDF 페이지 렌더링 중: ${name}`);
          });

          AppState.addPages(pdfPages);
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          UI.showToast(`'${pdfFile.name}'에서 ${pdfPages.length}개 페이지가 분해 로드되었습니다! (보안 해제 준비 완료, ${elapsed}초)`, 'success', 3500);
        } catch (err) {
          console.error(`PDF 로드 실패: ${pdfFile.name}`, err);
          UI.showToast(`PDF를 불러오는 중 오류가 발생했습니다: ${err.message}`, 'error', 4000);
        } finally {
          UI.hideProgress();
        }
      }
    }
  }

  // 체험용 샘플 카드 생성 (v0.1.0 UI 검증용)
  const sampleBtn = document.getElementById('btn-demo-sample');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      generateSampleCards();
    });
  }

  function generateSampleCards() {
    // 기본 그룹 하나 추가
    let demoGroup = AppState.groups.find(g => g.name === '1권 (문제편)');
    if (!demoGroup) {
      demoGroup = AppState.addGroup('1권 (문제편)', '#3b82f6');
    }

    const samplePages = [];
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
    const titles = ['스캔_001.png', '스캔_002.png', '스캔_003.png', '스캔_004.png', '스캔_005.png', '스캔_006.png'];

    for (let i = 0; i < 6; i++) {
      // 캔버스로 심플 썸네일 SVG/DataURL 생성
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 560;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 560);
      
      // 상단 헤더 바
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(20, 20, 360, 40);
      
      // 본문 더미 라인
      ctx.fillStyle = '#cbd5e1';
      for (let line = 0; line < 10; line++) {
        ctx.fillRect(30, 80 + line * 35, 340, 16);
      }

      // 페이지 번호 텍스트
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`샘플 페이지 #${i + 1}`, 200, 480);

      samplePages.push({
        id: 'sample_' + Date.now() + '_' + i,
        originFileName: titles[i],
        originalIndex: i + 1,
        rotation: 0,
        groupId: i < 3 ? demoGroup.id : 'unassigned',
        thumbnailUrl: canvas.toDataURL('image/png'),
        width: 400,
        height: 560
      });
    }

    AppState.addPages(samplePages);
    UI.showToast('체험용 샘플 카드 6장이 생성되었습니다!', 'success');
  }

  // 키보드 단축키
  window.addEventListener('keydown', (e) => {
    // 입력창 포커스 중에는 단축키 무시
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    // Ctrl+A (전체 선택)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      AppState.selectAll();
    }

    // Esc (계층적 닫기: 드롭다운 -> 모달 -> 선택 해제)
    if (e.key === 'Escape') {
      // 1순위: 열려있는 드롭다운이 있다면 드롭다운만 닫기 (선택 상태 보존!)
      const activeDropdowns = document.querySelectorAll('.dropdown.active');
      if (activeDropdowns.length > 0) {
        activeDropdowns.forEach(d => d.classList.remove('active'));
        return;
      }

      // 2순위: 열려있는 모달이 있다면 모달만 닫기 (선택 상태 보존!)
      const activeModals = document.querySelectorAll('.modal-overlay.active');
      if (activeModals.length > 0) {
        activeModals.forEach(m => UI.closeModal(m));
        return;
      }

      // 3순위: 열려있는 팝업이나 모달이 없을 때만 전체 선택 해제
      AppState.deselectAll();
    }

    // Delete (선택 삭제)
    if (e.key === 'Delete') {
      if (AppState.selectedPageIds.size > 0) {
        const count = AppState.selectedPageIds.size;
        if (confirm(`선택한 ${count}개의 페이지를 삭제하시겠습니까?`)) {
          AppState.removePages(Array.from(AppState.selectedPageIds));
          UI.showToast(`${count}개 페이지가 삭제되었습니다.`, 'info');
        }
      }
    }
  });

  // 3. 통합 PDF 저장 (무음 보안 해제 파이프라인 가동)
  document.getElementById('btn-export-single').addEventListener('click', async () => {
    if (AppState.pages.length === 0) {
      UI.showToast('내보낼 페이지가 없습니다. 이미지나 PDF를 먼저 추가해 주세요.', 'error');
      return;
    }

    const metadata = {
      title: document.getElementById('meta-title').value.trim(),
      author: document.getElementById('meta-author').value.trim(),
      subject: document.getElementById('meta-subject').value.trim(),
      keywords: document.getElementById('meta-keywords').value.trim()
    };

    const paperFit = document.querySelector('input[name="paper-fit"]:checked')?.value || 'fit_a4';
    const coverFullBleed = document.getElementById('cover-fullbleed')?.checked ?? true;

    const startTime = performance.now();
    UI.showProgress(0, AppState.pages.length, '보안 플래그 박멸 & 클린 PDF 생성 중...');

    try {
      const cleanBytes = await PdfLoader.buildCleanPdf(
        AppState.pages,
        metadata,
        paperFit,
        coverFullBleed,
        (current, total) => {
          UI.showProgress(current, total, '클린 페이지 패키징 중...');
        }
      );

      const filename = (metadata.title || 'PDF_Studio_Clean_Document') + '.pdf';
      PdfLoader.downloadPdf(cleanBytes, filename);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      UI.showToast(`🎉 보안 플래그가 100% 제거된 표준 PDF가 다운로드되었습니다! (삼성노트 완벽 호환, ${elapsed}초)`, 'success', 5000);
    } catch (err) {
      console.error('클린 PDF 생성 오류:', err);
      UI.showToast(`PDF 생성 중 오류가 발생했습니다: ${err.message}`, 'error', 4000);
    } finally {
      UI.hideProgress();
    }
  });

  // 4. 그룹별 분할 PDF & JSZip 일괄 압축 다운로드
  document.getElementById('btn-export-groups').addEventListener('click', async () => {
    if (AppState.pages.length === 0) {
      UI.showToast('내보낼 페이지가 없습니다. 이미지나 PDF를 먼저 추가해 주세요.', 'error');
      return;
    }

    const validGroups = AppState.groups.filter(g => AppState.pages.some(p => p.groupId === g.id));
    if (validGroups.length === 0) {
      UI.showToast('내보낼 그룹 페이지가 없습니다.', 'error');
      return;
    }

    if (validGroups.length === 1 && validGroups[0].id === 'unassigned') {
      UI.showToast('모든 페이지가 미지정 그룹에 있습니다. 그룹을 생성하여 분할하거나 통합 PDF 저장을 권장합니다.', 'info', 4000);
    }

    const metadata = {
      title: document.getElementById('meta-title').value.trim(),
      author: document.getElementById('meta-author').value.trim(),
      subject: document.getElementById('meta-subject').value.trim(),
      keywords: document.getElementById('meta-keywords').value.trim()
    };

    const paperFit = document.querySelector('input[name="paper-fit"]:checked')?.value || 'fit_a4';
    const coverFullBleed = document.getElementById('cover-fullbleed')?.checked ?? true;

    const startTime = performance.now();
    UI.showProgress(0, 100, '그룹별 분할 준비 중...');

    try {
      const result = await PdfLoader.exportGroupsToZip(
        {
          groups: AppState.groups,
          pages: AppState.pages,
          metadata,
          paperFit,
          coverFullBleed
        },
        (progress) => {
          if (progress.phase === 'building') {
            UI.showProgress(progress.percent, 100, `그룹 PDF 빌드 중: ${progress.groupName} (${progress.current}/${progress.total})`);
          } else if (progress.phase === 'compressing') {
            UI.showProgress(progress.percent, 100, `ZIP 압축 패키징 중... (${progress.percent}%)`);
          } else {
            UI.showProgress(100, 100, '압축 파일 생성 완료!');
          }
        }
      );

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      UI.showToast(`📦 ${result.groupCount}개 그룹의 분할 PDF가 '${result.zipFileName}' 파일로 압축 다운로드되었습니다! (${elapsed}초)`, 'success', 5000);
    } catch (err) {
      console.error('그룹 분할 ZIP 생성 오류:', err);
      UI.showToast(`그룹 분할 ZIP 생성 중 오류: ${err.message}`, 'error', 4000);
    } finally {
      UI.hideProgress();
    }
  });

  // 단일 그룹 단독 PDF 다운로드 이벤트 리스너
  window.addEventListener('export-single-group', async (e) => {
    const { groupId } = e.detail;
    const group = AppState.getGroup(groupId);
    if (!group) return;

    const groupPages = AppState.pages.filter(p => p.groupId === groupId);
    if (groupPages.length === 0) {
      UI.showToast(`'${group.name}' 그룹에 속한 페이지가 없습니다.`, 'warning');
      return;
    }

    const metadata = {
      title: document.getElementById('meta-title').value.trim(),
      author: document.getElementById('meta-author').value.trim(),
      subject: document.getElementById('meta-subject').value.trim(),
      keywords: document.getElementById('meta-keywords').value.trim()
    };
    const paperFit = document.querySelector('input[name="paper-fit"]:checked')?.value || 'fit_a4';
    const coverFullBleed = document.getElementById('cover-fullbleed')?.checked ?? true;

    const startTime = performance.now();
    UI.showProgress(0, groupPages.length, `'${group.name}' PDF 빌드 중...`);

    try {
      const result = await PdfLoader.exportSingleGroup(
        group,
        {
          pages: AppState.pages,
          metadata,
          paperFit,
          coverFullBleed
        },
        (current, total) => {
          UI.showProgress(current, total, `'${group.name}' 페이지 패키징 중...`);
        }
      );
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      UI.showToast(`💾 '${group.name}' (${result.pageCount}장) PDF가 다운로드되었습니다! (${elapsed}초)`, 'success', 4000);
    } catch (err) {
      console.error('단일 그룹 PDF 생성 오류:', err);
      UI.showToast(`그룹 PDF 생성 오류: ${err.message}`, 'error', 4000);
    } finally {
      UI.hideProgress();
    }
  });

  // PWA 서비스 워커 등록
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('Service Worker registration skipped/failed:', err);
    });
  }
});
