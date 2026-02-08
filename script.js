document.addEventListener('DOMContentLoaded', () => {
    // --- Element Cache ---
    const loginSection = document.getElementById('student-login-section');
    const reportSection = document.getElementById('report-section');
    const loginForm = document.getElementById('student-login-form');
    const errorMessage = document.getElementById('student-error-msg');
    const studentNameInput = document.getElementById('login-student-name');
    const studentIdInput = document.getElementById('login-student-id');
    const loadingSpinner = document.getElementById('loading-spinner');
    const sessionModal = document.getElementById('session-expired-modal');
    const sessionBtn = document.getElementById('session-expired-btn');

    // --- State ---
    let currentStudentData = null;
    const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://progressreport-7jlm.onrender.com';
    let inactivityTimer;
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

    // --- Functions ---

    /**
     * Resets the inactivity timer. This is called whenever the user interacts with the page.
     */
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        // Only run the timer when the report card is visible
        if (reportSection.classList.contains('active')) {
            inactivityTimer = setTimeout(() => {
                window.logout();
                if (sessionModal) sessionModal.classList.remove('hidden');
            }, INACTIVITY_TIMEOUT);
        }
    }

    function setupActivityListeners() {
        ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetInactivityTimer, true);
        });
    }

    /**
     * Handles the login form submission.
     * @param {Event} e The form submission event.
     */
    async function handleLogin(e) {
        e.preventDefault();
        errorMessage.classList.add('hidden');
        const name = studentNameInput.value.trim();
        const id = studentIdInput.value.trim();

        if (!name || !id) {
            errorMessage.textContent = 'Please enter both name and ID.';
            errorMessage.classList.remove('hidden');
            return;
        }

        // Show loading spinner and disable button
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/students/${id}`);
            if (!response.ok) {
                throw new Error('Student data not found.');
            }
            const studentData = await response.json();

            // Verify that the fetched student's name matches the input name (case-insensitive)
            if (studentData.name.toLowerCase() !== name.toLowerCase()) {
                throw new Error('Student name does not match the ID.');
            }

            currentStudentData = studentData;
            
            // Log student login
            fetch(`${API_BASE_URL}/api/student/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: studentData._id,
                    studentName: studentData.name,
                    action: 'STUDENT_LOGIN',
                    details: 'Student viewed report card'
                })
            }).catch(err => console.error("Logging failed", err));

            displayReportCard(currentStudentData);
            resetInactivityTimer(); // Start the inactivity timer on successful login

        } catch (error) {
            errorMessage.textContent = 'Invalid name or ID. Please try again.';
            errorMessage.classList.remove('hidden');
            console.error('Login failed:', error);
        } finally {
            // Hide loading spinner and enable button
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    /**
     * Renders the report card view with the student's data.
     * @param {object} student The student data object from the API.
     */
    function displayReportCard(student) {
        // Populate student info
        if (student.schoolName) document.getElementById('report-school-name').textContent = student.schoolName;
        document.getElementById('display-name').textContent = student.name;
        document.getElementById('display-id').textContent = student._id;
        document.getElementById('display-class').textContent = student.className || 'N/A';
        document.getElementById('display-roll').textContent = student.rollNumber || 'N/A';
        
        document.getElementById('report-year').textContent = student.academicYear || "Academic Year 2023-2024";
        document.getElementById('principal-comment-display').textContent = student.principalComment || "No remarks provided.";

        // Render table
        renderGradeTable(student.grades);

        // Switch views
        loginSection.classList.remove('active');
        loginSection.classList.add('hidden');
        reportSection.classList.remove('hidden');
        reportSection.classList.add('active');
    }

    /**
     * Converts a numerical score to a letter grade.
     * @param {number} score The numerical score.
     * @returns {string} The corresponding letter grade.
     */
    function getLetterGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    function calculateAvg(...values) {
        const validValues = values.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(v));
        if (validValues.length === 0) return null;
        return validValues.reduce((a, b) => a + b, 0) / validValues.length;
    }

    /**
     * Dynamically builds the grades table from the student's grade data.
     * @param {Array<object>} grades The array of grade objects for the student.
     */
    function renderGradeTable(grades) {
        const tableBody = document.getElementById('report-grades-body');
        // Ensure table is wrapped for responsiveness
        const table = tableBody.closest('table');
        if (table && !table.parentElement.classList.contains('table-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }

        const overallBadge = document.getElementById('overall-grade-badge');
        const finalPercentageEl = document.getElementById('final-percentage');

        // Clear previous data
        tableBody.innerHTML = '';

        if (grades.length === 0) return;

        let totalYearlyAvg = 0;
        let subjectCount = 0;

        // Column totals for footer
        const colTotals = { p1:0, p2:0, p3:0, exam1:0, sem1:0, p4:0, p5:0, p6:0, exam2:0, sem2:0, yearly:0 };
        const colCounts = { p1:0, p2:0, p3:0, exam1:0, sem1:0, p4:0, p5:0, p6:0, exam2:0, sem2:0, yearly:0 };

        const safeVal = (val) => (val === null || val === undefined || val === '') ? '-' : val;

        const getScoreClass = (val) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num < 70) return 'text-red-600 font-bold';
            return 'text-gray-600';
        };

        const getAvgClass = (val) => {
            if (val !== null && val < 70) return 'text-red-600';
            return 'text-indigo-700';
        };

        const getYearlyClass = (val) => {
            if (val !== null && val < 70) return 'text-red-600';
            return 'text-gray-900';
        };

        grades.forEach(grade => {
            const p1 = parseFloat(grade.p1);
            const p2 = parseFloat(grade.p2);
            const p3 = parseFloat(grade.p3);
            const p4 = parseFloat(grade.p4);
            const p5 = parseFloat(grade.p5);
            const p6 = parseFloat(grade.p6);
            const exam1 = parseFloat(grade.exam1);
            const exam2 = parseFloat(grade.exam2);

            const avg1 = calculateAvg(p1, p2, p3, exam1);
            const avg2 = calculateAvg(p4, p5, p6, exam2);
            
            let yearly = null;
            if (avg1 !== null && avg2 !== null) yearly = (avg1 + avg2) / 2;
            else if (avg1 !== null) yearly = avg1;
            else if (avg2 !== null) yearly = avg2;

            if (yearly !== null) {
                totalYearlyAvg += yearly;
                subjectCount++;
            }

            // Accumulate for footer
            const addToTotal = (key, val) => { if(!isNaN(val) && val !== null) { colTotals[key] += val; colCounts[key]++; } };
            addToTotal('p1', p1); addToTotal('p2', p2); addToTotal('p3', p3);
            addToTotal('exam1', exam1);
            addToTotal('sem1', avg1);
            addToTotal('p4', p4); addToTotal('p5', p5); addToTotal('p6', p6);
            addToTotal('exam2', exam2);
            addToTotal('sem2', avg2);
            addToTotal('yearly', yearly);

            const row = document.createElement('tr');
            row.className = "hover:bg-gray-50 transition-colors";
            row.innerHTML = `
                <td class="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 shadow-sm border-r border-gray-100">${grade.subject}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p1)}">${safeVal(grade.p1)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p2)}">${safeVal(grade.p2)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p3)}">${safeVal(grade.p3)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.exam1)}">${safeVal(grade.exam1)}</td>
                <td class="px-3 py-3 text-center text-sm font-bold ${getAvgClass(avg1)} bg-indigo-50 border-x border-indigo-100">${avg1 !== null ? avg1.toFixed(1) : '-'}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p4)}">${safeVal(grade.p4)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p5)}">${safeVal(grade.p5)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.p6)}">${safeVal(grade.p6)}</td>
                <td class="px-2 py-3 text-center text-sm ${getScoreClass(grade.exam2)}">${safeVal(grade.exam2)}</td>
                <td class="px-3 py-3 text-center text-sm font-bold ${getAvgClass(avg2)} bg-indigo-50 border-x border-indigo-100">${avg2 !== null ? avg2.toFixed(1) : '-'}</td>
                <td class="px-3 py-3 text-center text-sm font-bold ${getYearlyClass(yearly)} bg-gray-100">${yearly !== null ? yearly.toFixed(1) : '-'}</td>
                <td class="px-3 py-3 text-center text-sm font-bold ${yearly !== null && yearly < 70 ? 'text-red-600' : 'text-green-600'}">${yearly !== null ? getLetterGrade(yearly) : '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-600 italic border-l border-gray-100">${grade.comment || ''}</td>
            `;
            tableBody.appendChild(row);
        });

        // Footer Averages
        const setFooter = (id, key, defaultColor = '') => {
            const el = document.getElementById(id);
            if (colCounts[key] > 0) {
                const avg = colTotals[key] / colCounts[key];
                el.textContent = avg.toFixed(1);
                
                if (avg < 70) {
                    el.classList.add('text-red-600');
                    if (defaultColor) el.classList.remove(defaultColor);
                } else {
                    el.classList.remove('text-red-600');
                    if (defaultColor) el.classList.add(defaultColor);
                }
            } else {
                el.textContent = '-';
                el.classList.remove('text-red-600');
                if (defaultColor) el.classList.add(defaultColor);
            }
        };

        setFooter('avg-p1', 'p1'); setFooter('avg-p2', 'p2'); setFooter('avg-p3', 'p3');
        setFooter('avg-exam1', 'exam1');
        setFooter('avg-sem1', 'sem1', 'text-indigo-600');
        setFooter('avg-p4', 'p4'); setFooter('avg-p5', 'p5'); setFooter('avg-p6', 'p6');
        setFooter('avg-exam2', 'exam2');
        setFooter('avg-sem2', 'sem2', 'text-indigo-600');
        setFooter('avg-yearly', 'yearly', 'text-gray-800');

        const finalAvg = subjectCount > 0 ? (totalYearlyAvg / subjectCount) : 0;

        finalPercentageEl.textContent = finalAvg.toFixed(1) + '%';
        finalPercentageEl.className = `px-3 py-3 text-center font-bold bg-gray-100 ${finalAvg >= 70 ? 'text-indigo-700' : 'text-red-600'}`;
        overallBadge.textContent = getLetterGrade(finalAvg);
        overallBadge.className = `text-2xl font-bold ${finalAvg >= 60 ? 'text-indigo-700' : 'text-red-600'}`;

    }

    /**
     * Handles the logout process.
     */
    window.logout = function() {
        // Stop the inactivity timer
        clearTimeout(inactivityTimer);

        // Clear state and form inputs
        currentStudentData = null;
        loginForm.reset();

        // Switch views
        reportSection.classList.remove('active');
        reportSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        loginSection.classList.add('active');
    }

    /**
     * Triggers the browser's print dialog.
     */
    // --- Event Listeners ---
    loginForm.addEventListener('submit', handleLogin);
    
    if (sessionBtn) {
        sessionBtn.addEventListener('click', () => {
            if (sessionModal) sessionModal.classList.add('hidden');
        });
    }

    setupActivityListeners(); // Start listening for user activity
});