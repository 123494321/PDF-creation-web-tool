/**
 * PDF Studio - State Management Module (v1.0.2)
 * Central reactive application state and action mutators
 */

const AppState = {
  version: '1.0.2',
  pages: [],
  groups: [
    { id: 'unassigned', name: '미지정', color: '#94a3b8' }
  ],
  selectedPageIds: new Set(),
  activeGroupFilter: 'all', // 'all' or groupId
  metadata: {
    title: '',
    author: '',
    subject: '',
    keywords: ''
  },
  paperFit: 'fit_a4', // 'fit_a4' | 'fit_b5' | 'fit_letter' | 'original'
  coverFullBleed: true,
  theme: 'dark',

  // 이벤트 리스너 관리 (Pub/Sub)
  _listeners: {},

  subscribe(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    };
  },

  emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data, this));
    }
    if (this._listeners['*']) {
      this._listeners['*'].forEach(cb => cb(event, data, this));
    }
  },

  // 1. 페이지 조작 액션
  addPages(newPages) {
    if (!Array.isArray(newPages) || newPages.length === 0) return;
    const startIdx = this.pages.length;
    newPages.forEach((p, idx) => {
      p.displayIndex = startIdx + idx + 1;
      if (!p.groupId) p.groupId = 'unassigned';
      if (typeof p.rotation !== 'number') p.rotation = 0;
      this.pages.push(p);
    });
    this.refreshIndices();
    this.emit('pages:changed');
  },

  // 표지 전용 0번 슬롯(맨 앞) 삽입
  addCoverPage(coverPage) {
    if (!coverPage) return;
    coverPage.groupId = 'unassigned';
    coverPage.rotation = 0;
    this.pages.unshift(coverPage);
    this.refreshIndices();
    this.emit('pages:changed');
  },

  // 특정 페이지를 맨 앞 표지로 지정
  setAsCover(pageId) {
    const idx = this.pages.findIndex(p => p.id === pageId);
    if (idx > 0) {
      const [page] = this.pages.splice(idx, 1);
      this.pages.unshift(page);
      this.refreshIndices();
      this.emit('pages:changed');
    }
  },

  removePages(pageIds) {
    const idSet = new Set(pageIds);
    this.pages = this.pages.filter(p => !idSet.has(p.id));
    pageIds.forEach(id => this.selectedPageIds.delete(id));
    this.refreshIndices();
    this.emit('pages:changed');
    this.emit('selection:changed');
  },

  rotatePages(pageIds, deltaDeg = 90) {
    const idSet = new Set(pageIds);
    this.pages.forEach(p => {
      if (idSet.has(p.id)) {
        p.rotation = (p.rotation + deltaDeg) % 360;
        if (p.rotation < 0) p.rotation += 360;
      }
    });
    this.emit('pages:changed');
  },

  rotateAll(deltaDeg = 90) {
    this.pages.forEach(p => {
      p.rotation = (p.rotation + deltaDeg) % 360;
      if (p.rotation < 0) p.rotation += 360;
    });
    this.emit('pages:changed');
  },

  clearAll() {
    this.pages = [];
    this.selectedPageIds.clear();
    this.activeGroupFilter = 'all';
    this.emit('pages:changed');
    this.emit('selection:changed');
  },

  refreshIndices() {
    this.pages.forEach((p, idx) => {
      p.displayIndex = idx + 1;
    });
  },

  // 지능형 정렬
  sortPages(sortType) {
    if (this.pages.length <= 1) return;

    if (sortType === 'sort-natural') {
      // 자연어 정렬 (img1, img2, ..., img10)
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      this.pages.sort((a, b) => collator.compare(a.originFileName, b.originFileName));
    } else if (sortType === 'sort-name-asc') {
      this.pages.sort((a, b) => a.originFileName.localeCompare(b.originFileName));
    } else if (sortType === 'sort-name-desc') {
      this.pages.sort((a, b) => b.originFileName.localeCompare(a.originFileName));
    } else if (sortType === 'sort-date-asc') {
      this.pages.sort((a, b) => (a.originFileModified || 0) - (b.originFileModified || 0));
    } else if (sortType === 'sort-date-desc') {
      this.pages.sort((a, b) => (b.originFileModified || 0) - (a.originFileModified || 0));
    } else if (sortType === 'sort-reverse') {
      this.pages.reverse();
    }

    this.refreshIndices();
    this.emit('pages:changed');
  },

  // 2. 그룹 조작 액션
  addGroup(name, color = '#3b82f6') {
    const id = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const newGroup = { id, name, color };
    this.groups.push(newGroup);
    this.emit('groups:changed');
    return newGroup;
  },

  deleteGroup(groupId) {
    if (groupId === 'unassigned') return;
    this.pages.forEach(p => {
      if (p.groupId === groupId) {
        p.groupId = 'unassigned';
      }
    });
    this.groups = this.groups.filter(g => g.id !== groupId);
    if (this.activeGroupFilter === groupId) {
      this.activeGroupFilter = 'all';
    }
    this.emit('groups:changed');
    this.emit('pages:changed');
  },

  assignPagesToGroup(pageIds, groupId) {
    const idSet = new Set(pageIds);
    this.pages.forEach(p => {
      if (idSet.has(p.id)) {
        p.groupId = groupId;
      }
    });
    this.emit('pages:changed');
    this.emit('groups:changed');
  },

  setFilter(filterId) {
    this.activeGroupFilter = filterId;
    this.emit('filter:changed', filterId);
  },

  // 3. 선택 조작 액션
  toggleSelectPage(pageId, isMulti = false) {
    if (!isMulti) {
      if (this.selectedPageIds.has(pageId) && this.selectedPageIds.size === 1) {
        this.selectedPageIds.clear();
      } else {
        this.selectedPageIds.clear();
        this.selectedPageIds.add(pageId);
      }
    } else {
      if (this.selectedPageIds.has(pageId)) {
        this.selectedPageIds.delete(pageId);
      } else {
        this.selectedPageIds.add(pageId);
      }
    }
    this.emit('selection:changed');
  },

  selectAll() {
    const visiblePages = this.getVisiblePages();
    visiblePages.forEach(p => this.selectedPageIds.add(p.id));
    this.emit('selection:changed');
  },

  // 드래그 앤 드롭 순서 재배치
  reorderPages(sourcePageId, targetPageId, placeAfter = false) {
    if (sourcePageId === targetPageId) return;
    const srcIdx = this.pages.findIndex(p => p.id === sourcePageId);
    const tgtIdx = this.pages.findIndex(p => p.id === targetPageId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [movedPage] = this.pages.splice(srcIdx, 1);
    let insertIdx = this.pages.findIndex(p => p.id === targetPageId);
    if (placeAfter) insertIdx++;
    this.pages.splice(insertIdx, 0, movedPage);

    this.refreshIndices();
    this.emit('pages:changed');
  },

  // 그룹명 수정
  renameGroup(groupId, newName) {
    const group = this.groups.find(g => g.id === groupId);
    if (group && newName.trim()) {
      group.name = newName.trim();
      this.emit('groups:changed');
    }
  },

  // 특정 그룹의 페이지만 전체 선택
  selectGroupPages(groupId) {
    const pages = groupId === 'all' 
      ? this.pages 
      : this.pages.filter(p => p.groupId === groupId);
    this.selectedPageIds.clear();
    pages.forEach(p => this.selectedPageIds.add(p.id));
    this.emit('selection:changed');
  },

  // Shift+클릭 연속 범위 선택
  selectRange(fromPageId, toPageId) {
    const visible = this.getVisiblePages();
    const fromIdx = visible.findIndex(p => p.id === fromPageId);
    const toIdx = visible.findIndex(p => p.id === toPageId);
    if (fromIdx === -1 || toIdx === -1) return;

    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);

    for (let i = start; i <= end; i++) {
      this.selectedPageIds.add(visible[i].id);
    }
    this.emit('selection:changed');
  },

  // 선택 반전
  invertSelection() {
    const visible = this.getVisiblePages();
    visible.forEach(p => {
      if (this.selectedPageIds.has(p.id)) {
        this.selectedPageIds.delete(p.id);
      } else {
        this.selectedPageIds.add(p.id);
      }
    });
    this.emit('selection:changed');
  },

  deselectAll() {
    this.selectedPageIds.clear();
    this.emit('selection:changed');
  },

  // 4. 조회 헬퍼
  getVisiblePages() {
    if (this.activeGroupFilter === 'all') {
      return this.pages;
    }
    return this.pages.filter(p => p.groupId === this.activeGroupFilter);
  },

  getGroup(groupId) {
    return this.groups.find(g => g.id === groupId) || { id: 'unassigned', name: '미지정', color: '#94a3b8' };
  },

  getGroupCount(groupId) {
    if (groupId === 'all') return this.pages.length;
    return this.pages.filter(p => p.groupId === groupId).length;
  }
};
