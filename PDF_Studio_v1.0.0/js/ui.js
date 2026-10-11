/**
 * PDF Studio - UI Rendering & Interaction Module (v1.0.0)
 * Handles DOM rendering, card templates, sidebar list, modals, toasts
 */

const UI = {
  // DOM 요소 캐시
  elements: {},

  init() {
    this.cacheDOMElements();
    this.bindEvents();
    this.renderGroups();
    this.renderGrid();
  },

  cacheDOMElements() {
    this.elements = {
      // 메인 컨테이너
      mainCanvas: document.getElementById('main-canvas'),
      emptyState: document.getElementById('empty-state'),
      gridContainer: document.getElementById('grid-container'),
      pageGrid: document.getElementById('page-grid'),
      groupList: document.getElementById('group-list'),
      visibleCountText: document.getElementById('visible-count-text'),
      activeFilterBadge: document.getElementById('active-filter-badge'),

      // 플로팅 배치 액션바
      floatingBatchBar: document.getElementById('floating-batch-bar'),
      selectedCountBadge: document.getElementById('selected-count-badge'),
      batchGroupMenu: document.getElementById('batch-group-menu'),

      // 모달들
      modalNewGroup: document.getElementById('modal-new-group'),
      groupNameInput: document.getElementById('group-name-input'),
      colorPalette: document.getElementById('color-palette'),
      modalZoom: document.getElementById('modal-zoom'),
      zoomContent: document.getElementById('zoom-content'),
      zoomPageInfo: document.getElementById('zoom-page-info'),
      modalHelp: document.getElementById('modal-help'),
      toastContainer: document.getElementById('toast-container'),

      // 프로그레스 바
      progressToast: document.getElementById('progress-toast'),
      progressTitle: document.getElementById('progress-title'),
      progressPercent: document.getElementById('progress-percent'),
      progressBarFill: document.getElementById('progress-bar-fill'),

      // 테마
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      themeIcon: document.getElementById('theme-icon')
    };
  },

  bindEvents() {
    // 상태 변경 시 자동 렌더링 구독
    AppState.subscribe('pages:changed', () => {
      this.renderGrid();
      this.renderGroups();
    });

    AppState.subscribe('groups:changed', () => {
      this.renderGroups();
      this.renderGrid();
      this.renderBatchGroupMenu();
    });

    AppState.subscribe('selection:changed', () => {
      this.updateSelectionUI();
    });

    AppState.subscribe('filter:changed', (filterId) => {
      this.renderGrid();
      this.renderGroups();
    });

    // 테마 토글
    this.elements.btnThemeToggle.addEventListener('click', () => {
      this.toggleTheme();
    });

    // 도움말 모달
    document.getElementById('btn-help').addEventListener('click', () => {
      this.openModal(this.elements.modalHelp);
    });
    document.getElementById('btn-close-help').addEventListener('click', () => {
      this.closeModal(this.elements.modalHelp);
    });
    document.getElementById('btn-ok-help').addEventListener('click', () => {
      this.closeModal(this.elements.modalHelp);
    });

    // 줌 모달 닫기
    document.getElementById('btn-close-zoom').addEventListener('click', () => {
      this.closeModal(this.elements.modalZoom);
    });

    // 새 그룹 모달
    document.getElementById('btn-new-group').addEventListener('click', () => {
      this.openNewGroupModal();
    });
    document.getElementById('btn-close-group-modal').addEventListener('click', () => {
      this.closeModal(this.elements.modalNewGroup);
    });
    document.getElementById('btn-cancel-group').addEventListener('click', () => {
      this.closeModal(this.elements.modalNewGroup);
    });
    document.getElementById('btn-confirm-group').addEventListener('click', () => {
      this.submitNewGroup();
    });

    // 다중 선택 버튼들
    document.getElementById('btn-select-all').addEventListener('click', () => {
      AppState.selectAll();
    });
    document.getElementById('btn-deselect-all').addEventListener('click', () => {
      AppState.deselectAll();
    });
    const btnInvert = document.getElementById('btn-invert-select');
    if (btnInvert) {
      btnInvert.addEventListener('click', () => {
        AppState.invertSelection();
      });
    }
    document.getElementById('btn-batch-close').addEventListener('click', () => {
      AppState.deselectAll();
    });

    // 일괄 작업
    document.getElementById('btn-batch-rotate').addEventListener('click', () => {
      const selectedIds = Array.from(AppState.selectedPageIds);
      AppState.rotatePages(selectedIds, 90);
      this.showToast(`${selectedIds.length}개 페이지를 회전했습니다.`, 'info');
    });

    document.getElementById('btn-batch-delete').addEventListener('click', () => {
      const count = AppState.selectedPageIds.size;
      if (confirm(`선택한 ${count}개의 페이지를 삭제하시겠습니까?`)) {
        AppState.removePages(Array.from(AppState.selectedPageIds));
        this.showToast(`${count}개 페이지가 삭제되었습니다.`, 'info');
      }
    });

    // 전체 회전
    document.getElementById('btn-rotate-all').addEventListener('click', () => {
      if (AppState.pages.length === 0) {
        this.showToast('회전할 페이지가 없습니다.', 'info');
        return;
      }
      AppState.rotateAll(90);
      this.showToast('전체 페이지를 90도 회전했습니다.', 'info');
    });

    // 전체 삭제
    document.getElementById('btn-delete-all').addEventListener('click', () => {
      if (AppState.pages.length === 0) return;
      if (confirm('현재 작업대의 모든 페이지를 비우시겠습니까?')) {
        AppState.clearAll();
        this.showToast('작업 공간이 초기화되었습니다.', 'info');
      }
    });

    // 정렬 드롭다운 이벤트
    document.querySelectorAll('#sort-dropdown .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        AppState.sortPages(action);
        this.showToast('페이지가 성공적으로 정렬되었습니다.', 'success');
      });
    });
  },

  // 1. 그리드 렌더링
  renderGrid() {
    const visiblePages = AppState.getVisiblePages();
    const hasPages = AppState.pages.length > 0;

    if (!hasPages) {
      this.elements.emptyState.style.display = 'flex';
      this.elements.gridContainer.style.display = 'none';
      return;
    }

    this.elements.emptyState.style.display = 'none';
    this.elements.gridContainer.style.display = 'flex';

    // 카운트 및 필터 상태 업데이트
    const totalCount = AppState.pages.length;
    const currentCount = visiblePages.length;
    this.elements.visibleCountText.textContent = `${currentCount} / ${totalCount} 페이지`;

    const activeGroup = AppState.getGroup(AppState.activeGroupFilter);
    this.elements.activeFilterBadge.textContent = AppState.activeGroupFilter === 'all' 
      ? '전체 보기' 
      : `필터: ${activeGroup.name}`;

    // 카드 그리드 생성
    this.elements.pageGrid.innerHTML = '';
    visiblePages.forEach(page => {
      const card = this.createPageCardElement(page);
      this.elements.pageGrid.appendChild(card);
    });

    this.updateSelectionUI();
  },

  createPageCardElement(page) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.setAttribute('data-id', page.id);
    card.draggable = true;
    if (AppState.selectedPageIds.has(page.id)) {
      card.classList.add('selected');
    }

    const group = AppState.getGroup(page.groupId);

    const isCoverPage = page.displayIndex === 1;

    // 카드 HTML 템플릿
    card.innerHTML = `
      <div class="card-group-stripe" style="background-color: ${group.color}"></div>
      <div class="card-header">
        <span class="badge-current-num ${isCoverPage ? 'badge-cover' : ''}">${isCoverPage ? '⭐ #1 표지' : '#' + page.displayIndex}</span>
        <input type="checkbox" class="card-select-check" ${AppState.selectedPageIds.has(page.id) ? 'checked' : ''}>
      </div>
      <div class="card-thumb-wrapper">
        <img class="card-thumb-img" src="${page.thumbnailUrl}" style="transform: rotate(${page.rotation}deg)" alt="페이지 미리보기">
        <div class="card-quick-actions">
          <button class="action-btn-circle btn-rotate-page" title="90도 회전">↺</button>
          <button class="action-btn-circle btn-zoom-page" title="크게 보기">🔍</button>
          ${!isCoverPage ? `<button class="action-btn-circle btn-set-cover" title="맨 앞 표지(1번)로 지정">⭐</button>` : ''}
          <button class="action-btn-circle btn-delete-page text-danger" title="페이지 삭제">🗑️</button>
        </div>
      </div>
      <div class="card-footer">
        <span class="badge-origin-info" title="${page.originFileName} (p.${page.originalIndex})">
          ${page.originFileName} · p.${page.originalIndex}
        </span>
      </div>
    `;

    // 1. 체크박스 선택
    const checkInput = card.querySelector('.card-select-check');
    checkInput.addEventListener('change', (e) => {
      e.stopPropagation();
      AppState.toggleSelectPage(page.id, true);
      UI.lastSelectedPageId = page.id;
    });

    // 2. 카드 클릭 (단일 선택, Ctrl+클릭 다중, Shift+클릭 범위 선택)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-quick-actions') || e.target.closest('.card-select-check')) return;

      if (e.shiftKey && UI.lastSelectedPageId) {
        AppState.selectRange(UI.lastSelectedPageId, page.id);
      } else {
        const isMulti = e.ctrlKey || e.metaKey;
        AppState.toggleSelectPage(page.id, isMulti);
        UI.lastSelectedPageId = page.id;
      }
    });

    // 3. 드래그 앤 드롭 정렬 (Drag & Drop Sortable)
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', page.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.page-card').forEach(c => {
        c.classList.remove('drag-target-before', 'drag-target-after');
      });
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';

      const rect = card.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        card.classList.add('drag-target-before');
        card.classList.remove('drag-target-after');
      } else {
        card.classList.add('drag-target-after');
        card.classList.remove('drag-target-before');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-target-before', 'drag-target-after');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = e.dataTransfer.getData('text/plain');
      const isAfter = card.classList.contains('drag-target-after');
      card.classList.remove('drag-target-before', 'drag-target-after');

      if (sourceId && sourceId !== page.id) {
        AppState.reorderPages(sourceId, page.id, isAfter);
        UI.showToast('페이지 순서가 재배치되었습니다.', 'info', 1500);
      }
    });

    // 4. 개별 버튼 액션 (회전, 삭제, 줌)
    card.querySelector('.btn-rotate-page').addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.rotatePages([page.id], 90);
    });

    card.querySelector('.btn-delete-page').addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.removePages([page.id]);
    });

    card.querySelector('.btn-zoom-page').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openZoomModal(page);
    });

    const btnSetCover = card.querySelector('.btn-set-cover');
    if (btnSetCover) {
      btnSetCover.addEventListener('click', (e) => {
        e.stopPropagation();
        AppState.setAsCover(page.id);
        this.showToast(`'${page.originFileName}' 페이지를 문서의 맨 앞(1번) 표지로 지정했습니다!`, 'success');
      });
    }

    return card;
  },

  // 2. 그룹 사이드바 렌더링
  renderGroups() {
    this.elements.groupList.innerHTML = '';

    // '전체' 아이템
    const allItem = document.createElement('li');
    allItem.className = `group-item ${AppState.activeGroupFilter === 'all' ? 'active' : ''}`;
    allItem.innerHTML = `
      <div class="group-info">
        <span class="group-dot" style="background-color: var(--accent-primary)"></span>
        <span class="group-name">전체 페이지</span>
      </div>
      <span class="group-count">${AppState.getGroupCount('all')}</span>
    `;
    allItem.addEventListener('click', () => AppState.setFilter('all'));
    this.elements.groupList.appendChild(allItem);

    // 각 그룹 아이템들
    AppState.groups.forEach(group => {
      const item = document.createElement('li');
      item.className = `group-item ${AppState.activeGroupFilter === group.id ? 'active' : ''}`;
      
      const isCustom = group.id !== 'unassigned';
      item.innerHTML = `
        <div class="group-info">
          <span class="group-dot" style="background-color: ${group.color}"></span>
          <span class="group-name" title="${group.name}">${group.name}</span>
        </div>
        <div class="group-item-actions">
          <span class="group-count">${AppState.getGroupCount(group.id)}</span>
          <button class="btn btn-xs btn-ghost btn-select-group" title="이 그룹의 페이지만 선택">✓</button>
          <button class="btn btn-xs btn-ghost btn-export-this-group" title="이 그룹만 PDF 다운로드">💾</button>
          ${isCustom ? `
            <button class="btn btn-xs btn-ghost btn-rename-group" title="그룹 이름 수정">✏️</button>
            <button class="btn btn-xs btn-ghost text-danger btn-del-group" title="그룹 삭제">✕</button>
          ` : ''}
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        AppState.setFilter(group.id);
      });

      // 그룹 전체 선택
      item.querySelector('.btn-select-group').addEventListener('click', (e) => {
        e.stopPropagation();
        AppState.selectGroupPages(group.id);
        UI.showToast(`'${group.name}' 그룹의 페이지 ${AppState.getGroupCount(group.id)}개가 선택되었습니다.`, 'info');
      });

      // 이 그룹만 단독 PDF 다운로드
      const btnExportThisGroup = item.querySelector('.btn-export-this-group');
      if (btnExportThisGroup) {
        btnExportThisGroup.addEventListener('click', (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('export-single-group', { detail: { groupId: group.id } }));
        });
      }

      if (isCustom) {
        // 이름 수정
        item.querySelector('.btn-rename-group').addEventListener('click', (e) => {
          e.stopPropagation();
          const newName = prompt(`'${group.name}'의 새 이름을 입력해 주세요:`, group.name);
          if (newName && newName.trim() && newName.trim() !== group.name) {
            AppState.renameGroup(group.id, newName.trim());
            this.showToast('그룹 이름이 수정되었습니다.', 'success');
          }
        });

        // 삭제
        item.querySelector('.btn-del-group').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`'${group.name}' 그룹을 삭제하시겠습니까? (속한 페이지는 '미지정'으로 이동)`)) {
            AppState.deleteGroup(group.id);
            this.showToast(`'${group.name}' 그룹이 삭제되었습니다.`, 'info');
          }
        });
      }

      this.elements.groupList.appendChild(item);
    });

    this.renderBatchGroupMenu();
  },

  renderBatchGroupMenu() {
    this.elements.batchGroupMenu.innerHTML = '';
    AppState.groups.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'dropdown-item';
      btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${g.color};margin-right:6px;"></span>${g.name}`;
      btn.addEventListener('click', () => {
        const selectedIds = Array.from(AppState.selectedPageIds);
        AppState.assignPagesToGroup(selectedIds, g.id);
        this.showToast(`${selectedIds.length}개 페이지를 '${g.name}' 그룹으로 이동했습니다.`, 'success');
      });
      this.elements.batchGroupMenu.appendChild(btn);
    });
  },

  // 3. 다중 선택 UI 동기화
  updateSelectionUI() {
    const count = AppState.selectedPageIds.size;
    if (count > 0) {
      this.elements.floatingBatchBar.style.display = 'flex';
      this.elements.selectedCountBadge.textContent = `${count}개 선택됨`;
    } else {
      this.elements.floatingBatchBar.style.display = 'none';
    }

    // 카드 개별 체크박스 & 클래스 갱신
    document.querySelectorAll('.page-card').forEach(card => {
      const pageId = card.getAttribute('data-id');
      const isSel = AppState.selectedPageIds.has(pageId);
      card.classList.toggle('selected', isSel);
      const check = card.querySelector('.card-select-check');
      if (check) check.checked = isSel;
    });
  },

  // 4. 모달 관련
  openModal(modal) {
    modal.classList.add('active');
  },

  closeModal(modal) {
    modal.classList.remove('active');
  },

  openNewGroupModal() {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#eab308'];
    this.elements.colorPalette.innerHTML = '';
    let selectedColor = colors[0];

    colors.forEach((color, idx) => {
      const chip = document.createElement('button');
      chip.className = `color-chip-btn ${idx === 0 ? 'selected' : ''}`;
      chip.style.backgroundColor = color;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.color-chip-btn').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedColor = color;
      });
      this.elements.colorPalette.appendChild(chip);
    });

    this.elements.groupNameInput.value = '';
    this.selectedGroupColor = selectedColor;
    this.openModal(this.elements.modalNewGroup);
    setTimeout(() => this.elements.groupNameInput.focus(), 50);
  },

  submitNewGroup() {
    const name = this.elements.groupNameInput.value.trim();
    if (!name) {
      alert('그룹 이름을 입력해 주세요.');
      return;
    }
    const chip = this.elements.colorPalette.querySelector('.color-chip-btn.selected');
    const color = chip ? chip.style.backgroundColor : '#3b82f6';

    const group = AppState.addGroup(name, color);
    this.closeModal(this.elements.modalNewGroup);
    this.showToast(`새 그룹 '${group.name}'이 생성되었습니다.`, 'success');
  },

  openZoomModal(page) {
    const group = AppState.getGroup(page.groupId);
    this.elements.zoomContent.innerHTML = `
      <img src="${page.thumbnailUrl}" style="transform: rotate(${page.rotation}deg); max-width: 100%; max-height: 75vh;" alt="확대 미리보기">
    `;
    this.elements.zoomPageInfo.textContent = `#${page.displayIndex} (${page.originFileName} · p.${page.originalIndex}) [소속: ${group.name}]`;
    this.openModal(this.elements.modalZoom);
  },

  // 5. 토스트 알림
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  // 6. 로딩 프로그레스 제어
  showProgress(current, total, title = '이미지 처리 중...') {
    if (!this.elements.progressToast) return;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    this.elements.progressTitle.textContent = `${title} (${current}/${total})`;
    this.elements.progressPercent.textContent = `${pct}%`;
    this.elements.progressBarFill.style.width = `${pct}%`;
    this.elements.progressToast.style.display = 'flex';
  },

  hideProgress() {
    if (!this.elements.progressToast) return;
    setTimeout(() => {
      this.elements.progressToast.style.display = 'none';
      this.elements.progressBarFill.style.width = '0%';
    }, 400);
  },

  // 7. 테마 토글
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    AppState.theme = nextTheme;
    this.elements.themeIcon.textContent = nextTheme === 'dark' ? '🌙' : '☀️';
    this.showToast(`${nextTheme === 'dark' ? '다크' : '라이트'} 모드로 전환되었습니다.`, 'info', 1500);
  }
};
