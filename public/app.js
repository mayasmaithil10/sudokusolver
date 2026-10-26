(() => {
    const GRID_SIZE = 9;
    const BOX_SIZE = 3;
    const MAX_UNDOS = 100;

    // Board states
    let board = []; // current user+solver board numbers (0 for empty)
    let isOriginal = []; // Boolean matrix: true if user clue, false if empty/solver answer
    let solved = false;
    let solutionBoard = null; // last solved solution set
    let selectedCell = null; // {row, col}
    let undoStack = [];

    // Dom elements
    const sudokuGrid = document.getElementById('sudoku-grid');
    const messageDiv = document.getElementById('message');
    const solveBtn = document.getElementById('solve-btn');
    const checkBtn = document.getElementById('check-btn');
    const resetBtn = document.getElementById('reset-btn');
    const clearBtn = document.getElementById('clear-btn');
    const eraseBtn = document.getElementById('erase-btn');
    const undoBtn = document.getElementById('undo-btn');
    const numberPad = document.getElementById('number-pad');

    function createBoard() {
        sudokuGrid.innerHTML = '';

        for (let r = 0; r < GRID_SIZE; r++) {
            const row = document.createElement('tr');
            for (let c = 0; c < GRID_SIZE; c++) {
                const cell = document.createElement('td');
                cell.setAttribute('data-row', r);
                cell.setAttribute('data-col', c);
                cell.setAttribute('tabindex', -1);
                const boxIndex = Math.floor(r / BOX_SIZE) * BOX_SIZE + Math.floor(c / BOX_SIZE);
                cell.setAttribute('data-box', boxIndex);

                const input = document.createElement('input');
                input.setAttribute('type', 'text');
                input.setAttribute('inputmode', 'numeric');
                input.setAttribute('maxlength', 1);
                input.setAttribute('aria-label', `Row ${r + 1} Column ${c + 1}`);
                input.autocomplete = "off";
                input.spellcheck = false;
                // Prevent invalid keys here via JS on keydown
                input.addEventListener('keydown', handleInputKeyDown);
                input.addEventListener('focus', () => {
                    selectCell(r, c);
                });
                input.addEventListener('input', () => {
                    // Enforce digit 1–9 or empty
                    const val = input.value;
                    if (!/^[1-9]$/.test(val)) {
                        input.value = '';
                        updateBoardCell(r, c, 0);
                    } else {
                        updateBoardCell(r, c, parseInt(val));
                    }
                });

                cell.appendChild(input);
                row.appendChild(cell);
            }
            sudokuGrid.appendChild(row);
        }
    }

    // Initialize board arrays and clear
    function initBoard() {
        board = Array(GRID_SIZE)
            .fill(null)
            .map(() => Array(GRID_SIZE).fill(0));
        isOriginal = Array(GRID_SIZE)
            .fill(null)
            .map(() => Array(GRID_SIZE).fill(false));
        solutionBoard = null;
        solved = false;
        undoStack = [];
    }

    // Select a cell visually and logically
    function selectCell(r, c) {
        if (selectedCell && selectedCell.row === r && selectedCell.col === c) return;

        clearHighlights();
        selectedCell = { row: r, col: c };

        // Update UI highlight
        highlightSelectedCell(r, c);
    }

    // Clear all highlights
    function clearHighlights() {
        [...sudokuGrid.querySelectorAll('td')].forEach(cell => {
            cell.classList.remove('selected');
            cell.classList.remove('highlighted');
        });
    }

    // Highlight the selected cell and its row, col, box
    function highlightSelectedCell(r, c) {
        // Selected cell
        const selCell = sudokuGrid.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (selCell) selCell.classList.add('selected');

        // Highlight row
        for (let col = 0; col < GRID_SIZE; col++) {
            if (col !== c) {
                const cell = sudokuGrid.querySelector(`td[data-row="${r}"][data-col="${col}"]`);
                if (cell) cell.classList.add('highlighted');
            }
        }

        // Highlight col
        for (let row = 0; row < GRID_SIZE; row++) {
            if (row !== r) {
                const cell = sudokuGrid.querySelector(`td[data-row="${row}"][data-col="${c}"]`);
                if (cell) cell.classList.add('highlighted');
            }
        }

        // Highlight 3x3 box
        const startRow = Math.floor(r / BOX_SIZE) * BOX_SIZE;
        const startCol = Math.floor(c / BOX_SIZE) * BOX_SIZE;
        for (let row = startRow; row < startRow + BOX_SIZE; row++) {
            for (let col = startCol; col < startCol + BOX_SIZE; col++) {
                if (row !== r && col !== c) {
                    const cell = sudokuGrid.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
                    if (cell) cell.classList.add('highlighted');
                }
            }
        }

        // Focus input in selected cell
        const input = selCell?.querySelector('input');
        if (input) {
            input.focus();
            // Move cursor to end
            const val = input.value;
            input.value = '';
            input.value = val;
        }
    }

    // Update board array and mark original clues if needed
    function updateBoardCell(r, c, val, isUserEntry = true) {
        const prevVal = board[r][c];
        if (prevVal === val) return;
        // Push to undo stack only for user changes
        if (isUserEntry) {
            if (undoStack.length >= MAX_UNDOS) undoStack.shift();
            undoStack.push({ row: r, col: c, oldValue: prevVal, oldIsOriginal: isOriginal[r][c] });
        }

        board[r][c] = val;
        if (isUserEntry) {
            isOriginal[r][c] = val !== 0;
            // Editing original clues after solve disables solution
            if (solved && !boardsEqual(board, solutionBoard)) {
                solved = false;
                solutionBoard = null;
                showMessage('Changes detected. Please solve again.', 'info');
                clearSolverMarks();
            }
        }
    }

    // Show messages in the message area, type can be 'error', 'success', 'info'
    function showMessage(text, type = 'error') {
        messageDiv.textContent = text;
        messageDiv.className = '';
        if (type === 'success') messageDiv.classList.add('success');
        else if (type === 'error') messageDiv.classList.add('error');
        else if (type === 'info') messageDiv.classList.add('info');
    }

    // Clear message area
    function clearMessage() {
        messageDiv.textContent = '';
        messageDiv.className = '';
    }

    // Render the whole board in UI including style for original and solved cells
    function renderBoard() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const cell = sudokuGrid.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
                const input = cell.querySelector('input');
                const val = board[r][c];
                input.value = val === 0 ? '' : val.toString();

                cell.classList.remove('original', 'solved', 'conflict');
                if (isOriginal[r][c]) {
                    cell.classList.add('original');
                    input.disabled = false;
                    input.style.color = '';  // original clues color handled by CSS
                } else if (solved && solutionBoard && solutionBoard[r][c] !== 0) {
                    // If solved, mark solver answers in green
                    cell.classList.add('solved');
                    input.disabled = true;
                } else {
                    input.disabled = false;
                }
            }
        }
    }

    // Clear solver answers but keep clues
    function resetSolution() {
        if (!solved) {
            showMessage('No solution to reset.', 'info');
            return;
        }
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!isOriginal[r][c]) {
                    board[r][c] = 0;
                }
            }
        }
        solved = false;
        solutionBoard = null;
        clearMessage();
        renderBoard();
    }

    // Clear full board (prompt if unsaved)
    function clearAll() {
        if (solved || hasAnyEntry()) {
            if (!confirm('Clear entire grid? All clues and answers will be lost.')) return;
        }
        initBoard();
        solved = false;
        solutionBoard = null;
        undoStack = [];
        clearMessage();
        clearHighlights();
        renderBoard();
    }

    // Checks if any cell has nonzero entry
    function hasAnyEntry() {
        return board.some(row => row.some(cell => cell !== 0));
    }

    // Erase current selected cell
    function eraseSelectedCell() {
        if (!selectedCell) return;
        const { row, col } = selectedCell;
        if (board[row][col] === 0) return;

        updateBoardCell(row, col, 0);
        // Remove conflict style if any for erased cell
        const cell = sudokuGrid.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (cell) cell.classList.remove('conflict');
        clearMessage();
        renderBoard();
    }

    // Undo last entry by user
    function undo() {
        if (undoStack.length === 0) {
            showMessage('Nothing to undo.', 'info');
            return;
        }
        const last = undoStack.pop();
        board[last.row][last.col] = last.oldValue;
        isOriginal[last.row][last.col] = last.oldIsOriginal;
        // Editing original clues disables solved state
        if (solved) {
            solved = false;
            solutionBoard = null;
            showMessage('Undo changed clues. Please solve again.', 'info');
        } else {
            clearMessage();
        }
        renderBoard();
        selectCell(last.row, last.col);
    }

    // Handle keyboard on inputs: allow digits 1-9, backspace, delete, arrow keys
    function handleInputKeyDown(e) {
        const validKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const key = e.key;
        if (validKeys.includes(key)) {
            // Accept digit normally, handled in input event
            return;
        } else if (key === 'Backspace' || key === 'Delete') {
            e.preventDefault();
            const r = parseInt(this.parentElement.getAttribute('data-row'), 10);
            const c = parseInt(this.parentElement.getAttribute('data-col'), 10);
            updateBoardCell(r, c, 0);
            this.value = '';
            clearMessage();
            renderBoard();
            selectCell(r, c);
        } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
            e.preventDefault();
            moveSelection(key);
        } else {
            // Prevent any other key input
            e.preventDefault();
        }
    }

    // Move selection based on arrow keys
    function moveSelection(key) {
        if (!selectedCell) return;
        let { row, col } = selectedCell;
        switch (key) {
            case 'ArrowUp': row = (row + GRID_SIZE - 1) % GRID_SIZE; break;
            case 'ArrowDown': row = (row + 1) % GRID_SIZE; break;
            case 'ArrowLeft': col = (col + GRID_SIZE - 1) % GRID_SIZE; break;
            case 'ArrowRight': col = (col + 1) % GRID_SIZE; break;
        }
        selectCell(row, col);
    }

    // Detect conflicts and return a list of conflicting cells
    // conflicts: Array of objects {row, col}
    function detectConflicts(boardToCheck) {
        const conflicts = new Set();

        function key(row, col) { return row + ',' + col; }

        // Check rows
        for (let r = 0; r < GRID_SIZE; r++) {
            const counts = new Map();
            for (let c = 0; c < GRID_SIZE; c++) {
                const val = boardToCheck[r][c];
                if (val === 0) continue;
                if (!counts.has(val)) counts.set(val, []);
                counts.get(val).push({ r, c });
            }
            for (const [val, cells] of counts) {
                if (cells.length > 1) cells.forEach(cell => conflicts.add(key(cell.r, cell.c)));
            }
        }

        // Check columns
        for (let c = 0; c < GRID_SIZE; c++) {
            const counts = new Map();
            for (let r = 0; r < GRID_SIZE; r++) {
                const val = boardToCheck[r][c];
                if (val === 0) continue;
                if (!counts.has(val)) counts.set(val, []);
                counts.get(val).push({ r, c });
            }
            for (const [val, cells] of counts) {
                if (cells.length > 1) cells.forEach(cell => conflicts.add(key(cell.r, cell.c)));
            }
        }

        // Check boxes
        for (let boxRow = 0; boxRow < BOX_SIZE; boxRow++) {
            for (let boxCol = 0; boxCol < BOX_SIZE; boxCol++) {
                const counts = new Map();
                for (let r = boxRow * BOX_SIZE; r < (boxRow + 1) * BOX_SIZE; r++) {
                    for (let c = boxCol * BOX_SIZE; c < (boxCol + 1) * BOX_SIZE; c++) {
                        const val = boardToCheck[r][c];
                        if (val === 0) continue;
                        if (!counts.has(val)) counts.set(val, []);
                        counts.get(val).push({ r, c });
                    }
                }
                for (const [val, cells] of counts) {
                    if (cells.length > 1) cells.forEach(cell => conflicts.add(key(cell.r, cell.c)));
                }
            }
        }

        // Return array of objects
        return [...conflicts].map(str => {
            const parts = str.split(',');
            return { row: parseInt(parts[0], 10), col: parseInt(parts[1], 10) };
        });
    }

    // Update the UI conflict highlights based on conflicts list
    function markConflicts(conflicts) {
        // Clear previous conflicts
        [...sudokuGrid.querySelectorAll('td.conflict')].forEach(cell => cell.classList.remove('conflict'));
        conflicts.forEach(({ row, col }) => {
            const cell = sudokuGrid.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
            if (cell) cell.classList.add('conflict');
        });
    }

    // Clear all conflict highlights
    function clearConflicts() {
        [...sudokuGrid.querySelectorAll('td.conflict')].forEach(cell => cell.classList.remove('conflict'));
    }

    // Deep copy board
    function copyBoard(b) {
        return b.map(row => row.slice());
    }

    // Check if two boards are equal
    function boardsEqual(b1, b2) {
        if (!b1 || !b2) return false;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (b1[r][c] !== b2[r][c]) return false;
            }
        }
        return true;
    }

    // Solver code with backtracking and multiple solution detection

    // Get valid candidates for position (row,col) given board state
    function getCandidates(boardState, row, col) {
        if (boardState[row][col] !== 0) return [];

        const used = new Set();

        // row
        for (let c = 0; c < GRID_SIZE; c++) {
            if (boardState[row][c] !== 0) used.add(boardState[row][c]);
        }

        // col
        for (let r = 0; r < GRID_SIZE; r++) {
            if (boardState[r][col] !== 0) used.add(boardState[r][col]);
        }

        // box
        const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
        const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;
        for (let r = boxRow; r < boxRow + BOX_SIZE; r++) {
            for (let c = boxCol; c < boxCol + BOX_SIZE; c++) {
                if (boardState[r][c] !== 0) used.add(boardState[r][c]);
            }
        }

        const candidates = [];
        for (let num = 1; num <= 9; num++) {
            if (!used.has(num)) candidates.push(num);
        }

        return candidates;
    }

    // Find empty cell with fewest candidates for better performance
    function findEmptyCellWithFewestCandidates(boardState) {
        let minCandidatesCount = 10;
        let bestCell = null;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (boardState[r][c] === 0) {
                    const candidates = getCandidates(boardState, r, c);
                    if (candidates.length === 0) return null; // unsolvable from here
                    if (candidates.length < minCandidatesCount) {
                        minCandidatesCount = candidates.length;
                        bestCell = { row: r, col: c, candidates };
                        if (minCandidatesCount === 1) return bestCell; // can't get smaller
                    }
                }
            }
        }
        return bestCell;
    }

    // Main solver function (backtracking)
    // Parameters allow for detection of multiple solutions by counting how many solutions found so far
    function solveSudoku(boardState, solutionsFound, maxSolutions) {
        if (solutionsFound.count >= maxSolutions) return;

        const emptyCellInfo = findEmptyCellWithFewestCandidates(boardState);
        if (!emptyCellInfo) {
            // No empty cells or no candidates - solved or dead end
            // If no empty cells => complete solved
            const anyEmpty = boardState.flat().some(x => x === 0);
            if (!anyEmpty) {
                // Store solution copy
                solutionsFound.solutions.push(copyBoard(boardState));
                solutionsFound.count++;
            }
            return;
        }

        const { row, col, candidates } = emptyCellInfo;
        for (const candidate of candidates) {
            boardState[row][col] = candidate;
            // Recursively try
            solveSudoku(boardState, solutionsFound, maxSolutions);
            if (solutionsFound.count >= maxSolutions) {
                boardState[row][col] = 0;
                return;
            }
            boardState[row][col] = 0;
        }
    }

    // Wrapper to solve and detect multiple solutions
    // Returns {found: boolean, multiple: boolean, solutions: [...]}
    function solveAndCheckMultipleSolutions(inputBoard) {
        const boardCopy = copyBoard(inputBoard);
        const solutionsFound = { count: 0, solutions: [] };
        solveSudoku(boardCopy, solutionsFound, 2);
        return {
            found: solutionsFound.count > 0,
            multiple: solutionsFound.count > 1,
            solutions: solutionsFound.solutions
        };
    }

    // Validate the user-entered clues for conflicts
    // Return true if valid, false if conflicts present
    function validateUserEntries() {
        clearConflicts();
        clearMessage();

        const conflicts = detectConflicts(board);
        if (conflicts.length === 0) {
            showMessage('No conflicts detected.', 'success');
            return true;
        } else {
            markConflicts(conflicts);
            showMessage('Conflicts detected! Fix them before solving.', 'error');
            return false;
        }
    }

    // Solve button handler
    function onSolveClick() {
        clearMessage();
        clearConflicts();

        // Validate first:
        if (!validateUserEntries()) {
            return;
        }

        // If no clues at all, special case:
        if (!board.flat().some(x => x !== 0)) {
            showMessage('Empty puzzle has multiple solutions. Please enter clues.', 'info');
            return;
        }

        showMessage('Solving...');
        // Solve detecting multiple solutions
        const result = solveAndCheckMultipleSolutions(board);

        if (!result.found) {
            showMessage('No solution exists for the given clues.', 'error');
            return;
        }

        if (result.multiple) {
            showMessage('Multiple solutions exist for the given clues.', 'error');
            return;
        }

        // Exactly one solution found:
        const solvedBoard = result.solutions[0];
        solutionBoard = solvedBoard;
        solved = true;

        // Fill in solver answers but leave clues as is
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!isOriginal[r][c]) {
                    board[r][c] = solvedBoard[r][c];
                }
            }
        }

        showMessage('Puzzle solved successfully!', 'success');
        renderBoard();
        clearConflicts();
    }

    // Check entries button
    function onCheckClick() {
        if (validateUserEntries()) {
            showMessage('No conflicting clues found.', 'success');
        }
    }

    // Reset solution button
    function onResetClick() {
        resetSolution();
    }

    // Clear all button
    function onClearClick() {
        clearAll();
    }

    // Erase button
    function onEraseClick() {
        eraseSelectedCell();
    }

    // Undo button
    function onUndoClick() {
        undo();
    }

    // Number pad button handler
    function onNumberPadClick(e) {
        if (!selectedCell) return;
        if (!e.target.classList.contains('num-btn')) return;
        const val = parseInt(e.target.getAttribute('data-num'), 10);
        const { row, col } = selectedCell;

        if (isOriginal[row][col]) {
            // User edits original clue => mark entry as updated
        }

        updateBoardCell(row, col, val);
        clearMessage();
        renderBoard();
        selectCell(row, col);
    }

    // Add event listeners
    function addEventListeners() {
        solveBtn.addEventListener('click', onSolveClick);
        checkBtn.addEventListener('click', onCheckClick);
        resetBtn.addEventListener('click', onResetClick);
        clearBtn.addEventListener('click', onClearClick);
        eraseBtn.addEventListener('click', onEraseClick);
        undoBtn.addEventListener('click', onUndoClick);
        numberPad.addEventListener('click', onNumberPadClick);

        // Clicking outside inputs clears selection
        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('#sudoku-grid') && !e.target.closest('#number-pad') && !e.target.closest('#controls')) {
                selectedCell = null;
                clearHighlights();
            }
        });
    }

    // Clear solver marks (solved cells styling)
    function clearSolverMarks() {
        solutionBoard = null;
        solved = false;
        renderBoard();
    }

    // Initialize entire app on DOM ready
    function init() {
        initBoard();
        createBoard();
        renderBoard();
        addEventListeners();
        clearMessage();

        // Select first cell initially
        selectCell(0, 0);
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);
})();
