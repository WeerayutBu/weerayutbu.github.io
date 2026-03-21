(() => {
    const csvUpload = document.getElementById('csv-upload');
    const docList = document.getElementById('doc-list');
    const docViewer = document.getElementById('doc-viewer');
    const resultsList = document.getElementById('results-list');
    const popup = document.getElementById('selection-popup');
    const columnSelect = document.getElementById('column-select');
    const exportBtn = document.getElementById('export-btn');
    const sidebarLabel = document.getElementById('sidebar-label');

    let documents = [];
    let allColumns = [];
    let selectedColumn = '';
    let activeIndex = -1;
    let results = [];
    let currentTokens = []; // parsed tokens for the active doc + column

    // ── CSV Parsing ──────────────────────────────────────────────
    function parseCSV(text) {
        // Split into lines, respecting quoted fields that span newlines
        const lines = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
                current += ch; // keep quotes for splitCSVLine
            } else if (ch === '\n' && !inQuotes) {
                lines.push(current);
                current = '';
            } else if (ch === '\r' && !inQuotes) {
                // skip
            } else {
                current += ch;
            }
        }
        if (current.trim()) lines.push(current);
        if (lines.length === 0) return [];

        const rows = [];
        const headers = splitCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
            const values = splitCSVLine(lines[i]);
            const row = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = (values[idx] || '').trim();
            });
            rows.push(row);
        }
        return rows;
    }

    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current);
        return result;
    }

    // ── Token Parsing ────────────────────────────────────────────
    // Detects if a value looks like a token list: ['word', 'word', ...]
    function isTokenList(val) {
        const trimmed = val.trim();
        return trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.includes("'");
    }

    function parseTokens(val) {
        const trimmed = val.trim().slice(1, -1); // remove [ ]
        const tokens = [];
        let current = '';
        let inStr = false;
        let quote = '';
        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (!inStr && (ch === "'" || ch === '"')) {
                inStr = true;
                quote = ch;
            } else if (inStr && ch === quote) {
                tokens.push(current);
                current = '';
                inStr = false;
            } else if (inStr) {
                current += ch;
            }
        }
        return tokens;
    }

    // ── Upload Handler ───────────────────────────────────────────
    csvUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            documents = parseCSV(ev.target.result);
            if (documents.length === 0) {
                docList.innerHTML = '<p class="dr-placeholder">No records found in CSV.</p>';
                docViewer.innerHTML = '<p class="dr-placeholder">Select a document to view.</p>';
                columnSelect.hidden = true;
                return;
            }
            allColumns = Object.keys(documents[0]);
            const dataCol = allColumns.find(c => c.toLowerCase() === 'data')
                || allColumns.find(c => c.toLowerCase() === 'tokens')
                || allColumns.find(c => c.toLowerCase() === 'text');
            selectedColumn = dataCol || allColumns[0];
            renderColumnSelect();
            renderDocList();
            selectDoc(0);
        };
        reader.readAsText(file);
        csvUpload.value = '';
    });

    // ── Column Dropdown ─────────────────────────────────────────
    function renderColumnSelect() {
        columnSelect.hidden = false;
        columnSelect.innerHTML = '';
        allColumns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            if (col === selectedColumn) opt.selected = true;
            columnSelect.appendChild(opt);
        });
    }

    columnSelect.addEventListener('change', () => {
        selectedColumn = columnSelect.value;
        if (activeIndex >= 0) renderDocViewer(documents[activeIndex], activeIndex);
    });

    // ── Document List (sidebar) ─────────────────────────────────
    function renderDocList() {
        docList.innerHTML = '';
        documents.forEach((_, i) => {
            const row = document.createElement('button');
            row.className = 'doc-row' + (i === activeIndex ? ' active' : '');
            row.textContent = `Row ${i + 1}`;
            row.addEventListener('click', () => selectDoc(i));
            docList.appendChild(row);
        });
    }

    function selectDoc(index) {
        activeIndex = index;
        const rows = docList.querySelectorAll('.doc-row');
        rows.forEach((row, i) => {
            row.classList.toggle('active', i === index);
        });
        if (rows[index]) rows[index].scrollIntoView({ block: 'nearest' });
        renderDocViewer(documents[index], index);
    }

    // ── Keyboard Navigation ──────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (documents.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectDoc(Math.min(activeIndex + 1, documents.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectDoc(Math.max(activeIndex - 1, 0));
        }
    });

    // ── Document Viewer ──────────────────────────────────────────
    function renderDocViewer(doc, index) {
        const val = doc[selectedColumn] || '';
        const docId = doc.document_id || doc.id || doc.ID || '';

        let contentHTML;
        if (isTokenList(val)) {
            currentTokens = parseTokens(val);
            contentHTML = renderTokens(currentTokens);
        } else {
            currentTokens = [];
            contentHTML = `<div class="doc-body">${escapeHTML(val)}</div>`;
        }

        sidebarLabel.textContent = `Row ${index + 1}` + (docId ? ` · ID: ${docId}` : '') + (currentTokens.length ? ` · ${currentTokens.length} tokens` : '');

        docViewer.innerHTML = `
            <div class="doc-card">
                <div class="doc-field">
                    <span class="doc-field-label">${escapeHTML(selectedColumn)}</span>
                    ${contentHTML}
                </div>
            </div>
        `;
    }

    function renderTokens(tokens) {
        let html = '<div class="token-container">';
        tokens.forEach((tok, i) => {
            if (i > 0) html += ' ';
            html += `<span class="token" data-idx="${i}">${escapeHTML(tok)}</span>`;
        });
        html += '</div>';
        return html;
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Get Selected Token Span ──────────────────────────────────
    function getSelectedSpan() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;

        const range = selection.getRangeAt(0);
        const container = docViewer.querySelector('.token-container');
        if (!container) return null;

        // Find all .token elements that intersect the selection
        const tokenEls = container.querySelectorAll('.token');
        let startIdx = -1;
        let endIdx = -1;

        for (const el of tokenEls) {
            if (selection.containsNode(el, true)) {
                const idx = parseInt(el.dataset.idx, 10);
                if (startIdx === -1 || idx < startIdx) startIdx = idx;
                if (idx > endIdx) endIdx = idx;
            }
        }

        if (startIdx === -1) return null;
        return { start: startIdx, end: endIdx };
    }

    // ── Text Selection & Popup ───────────────────────────────────
    document.addEventListener('mouseup', () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (!text || !docViewer.contains(selection.anchorNode)) {
            popup.classList.remove('visible');
            return;
        }

        const rect = selection.getRangeAt(0).getBoundingClientRect();

        popup.style.left = `${rect.left + rect.width / 2 - popup.offsetWidth / 2}px`;
        popup.style.top = `${rect.top - 44 + window.scrollY}px`;
        popup.classList.add('visible');
    });

    document.addEventListener('mousedown', (e) => {
        if (!popup.contains(e.target)) {
            popup.classList.remove('visible');
        }
    });

    popup.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;
        const selectedText = window.getSelection().toString().trim();
        if (!selectedText) return;

        const span = getSelectedSpan();
        addResult(action, selectedText, activeIndex, span);
        popup.classList.remove('visible');
        window.getSelection().removeAllRanges();
    });

    // ── Results Panel ────────────────────────────────────────────
    function addResult(action, text, docIndex, span) {
        const doc = documents[docIndex];
        const docId = doc?.document_id || doc?.id || doc?.ID || '';
        const actionLabel = action === 'model' ? 'Sent to Model' : 'Saved';
        const response = action === 'model'
            ? generateModelResponse(text)
            : 'Selection saved for reference.';

        const spanStart = span ? span.start : '';
        const spanEnd = span ? span.end : '';
        const spanLabel = span ? `[${span.start}:${span.end}]` : '';

        results.push({
            docIndex: docIndex + 1,
            docId,
            column: selectedColumn,
            action: actionLabel,
            text,
            span_start: spanStart,
            span_end: spanEnd,
            response
        });

        if (results.length === 1) {
            resultsList.innerHTML = '';
            exportBtn.hidden = false;
        }

        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="result-action">${actionLabel}</div>
            <div class="result-source">Row ${docIndex + 1}${docId ? ` &middot; ID: ${escapeHTML(docId)}` : ''} &middot; ${escapeHTML(selectedColumn)}${spanLabel ? ` &middot; span ${spanLabel}` : ''}</div>
            <div class="result-text">${escapeHTML(text)}</div>
            <div class="result-response">${escapeHTML(response)}</div>
        `;

        resultsList.prepend(card);
    }

    function generateModelResponse(text) {
        const len = text.split(/\s+/).length;
        if (len <= 5) return 'Short excerpt noted. Consider expanding context for better analysis.';
        if (len <= 20) return `Key passage identified (${len} words). This could be relevant for entity extraction or summarization.`;
        return `Substantial passage (${len} words) received. Ready for further NLP processing such as classification, NER, or summarization.`;
    }

    // ── Export ────────────────────────────────────────────────────
    exportBtn.addEventListener('click', () => {
        if (results.length === 0) return;

        const header = 'row,doc_id,column,action,span_start,span_end,selected_text,response';
        const rows = results.map(r =>
            [r.docIndex, csvField(r.docId), csvField(r.column), csvField(r.action), r.span_start, r.span_end, csvField(r.text), csvField(r.response)].join(',')
        );
        const csv = [header, ...rows].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'docreview_results.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    function csvField(str) {
        if (str == null) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    // ── Resizable Results Panel ──────────────────────────────────

    const resizeHandle = document.getElementById('resize-handle');
    const resultsPanel = document.getElementById('results-panel');

    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerRight = document.querySelector('.dr-layout').getBoundingClientRect().right;
        const newWidth = containerRight - e.clientX;
        const clamped = Math.max(150, Math.min(600, newWidth));
        resultsPanel.style.width = clamped + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
})();
