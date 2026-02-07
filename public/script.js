document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const reportSection = document.getElementById('report-section');
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const logoutBtn = document.getElementById('logout-btn');
    const printBtn = document.getElementById('print-btn');
    const gradeFormatToggle = document.getElementById('grade-format-toggle');

    // --- API Communication Layer ---
    // This should be the URL of your deployed backend server (e.g., from Render).
    // Using a relative path since the frontend is served by the same server as the API.
    const API_BASE_URL = '';

    let currentStudentData = null; // To store the current student's data

    // Function to Fetch a single student's data from the backend
    async function getStudent(id) {
        const response = await fetch(`${API_BASE_URL}/api/students/${id}`);
        if (!response.ok) {
            throw new Error('Student not found');
        }
        return await response.json();
    }

    // --- Login Logic ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('student-name').value.trim();
        const id = document.getElementById('student-id').value.trim();

        try {
            const studentData = await getStudent(id);
            if (studentData && studentData.name.toLowerCase() === name.toLowerCase()) {
                currentStudentData = studentData; // Store data
                displayReportCard(studentData, id);
                showSection('report');
            } else {
                errorMessage.classList.remove('hidden');
            }
        } catch (error) {
            errorMessage.classList.remove('hidden');
        }
    });

    // --- Logout Logic ---
    logoutBtn.addEventListener('click', () => {
        loginForm.reset();
        currentStudentData = null;
        reportSection.classList.remove('active');
        showSection('login');
    });

    // --- Print Logic ---
    printBtn.addEventListener('click', () => {
        window.print();
    });

    // --- Grade Format Toggle Logic ---
    gradeFormatToggle.addEventListener('change', () => {
        if (currentStudentData) {
            displayReportCard(currentStudentData, currentStudentData._id);
        }
    });

    // Helper function to switch between login and report sections
    function showSection(sectionName) {
        if (sectionName === 'report') {
            loginSection.classList.remove('active');
            loginSection.classList.add('hidden');
            reportSection.classList.remove('hidden');
            reportSection.classList.add('active');
            errorMessage.classList.add('hidden');
        } else { // 'login'
            reportSection.classList.remove('active');
            reportSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
            loginSection.classList.add('active');
        }
    }

    // --- Report Card Display Logic ---

    /**
     * Groups periods into semesters based on the presence of exam periods.
     * e.g., [p1, p2, exam1, p3, p4, exam2] -> [[p1, p2, exam1], [p3, p4, exam2]]
     * @param {Array<Object>} activePeriods - Array of period objects {id, name, type}.
     * @returns {Array<Array<Object>>} An array of semester arrays.
     */
    function groupPeriodsIntoSemesters(activePeriods) {
        const semesters = [];
        let currentSemester = [];
        // Sort periods to ensure logical order (p1, p2, exam1, p3...)
        activePeriods.sort((a, b) => {
            const aNum = parseInt(a.id.replace(/\D/g, ''));
            const bNum = parseInt(b.id.replace(/\D/g, ''));
            if (a.type !== b.type) return a.type === 'exam' ? 1 : -1; // exams last
            return aNum - bNum;
        });

        for (const period of activePeriods) {
            currentSemester.push(period);
            if (period.type === 'exam') {
                semesters.push(currentSemester);
                currentSemester = [];
            }
        }
        // If there are periods left that didn't form a semester (e.g., no exams),
        // or if there were no periods to begin with, treat the remaining as a single semester.
        if (currentSemester.length > 0 || activePeriods.length === 0) {
            semesters.push(currentSemester);
        }
        
        return semesters.length > 0 ? semesters : [activePeriods];
    }

    /**
     * Builds the HTML for the table header (thead).
     * @param {Array<Array<Object>>} semesters - An array of semester arrays.
     * @returns {string} The inner HTML for the thead element.
     */
    function buildTableHeader(semesters) {
        let headerHTML = '<tr><th class="subject-col">Subject</th>';
        semesters.forEach((semesterPeriods, index) => {
            semesterPeriods.forEach(p => headerHTML += `<th>${p.name}</th>`);
            if (semesterPeriods.length > 0) headerHTML += `<th>Sem ${index + 1} Avg</th>`;
        });
        headerHTML += '<th>Final Avg</th></tr>';
        return headerHTML;
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

    function formatGrade(score) {
        const showNumberGrades = gradeFormatToggle.checked;
        return showNumberGrades ? score.toFixed(2) : getLetterGrade(score);
    }
    /**
     * Builds the HTML for the table body (tbody) with all subjects and their grades.
     * @param {Array<Object>} grades - The array of grade data for the student.
     * @param {Array<Array<Object>>} semesters - An array of semester arrays.
     * @returns {string} The inner HTML for the tbody element.
     */
    function buildTableBody(grades, semesters) {
        let bodyHTML = '';
        grades.forEach(subjectGrade => {
            let rowHTML = `<tr><td class="subject-col">${subjectGrade.subject}</td>`;
            const semesterAverages = [];

        // Find highest and lowest scores for the current subject across all periods
        const allScores = semesters.flat().map(p => parseFloat(subjectGrade[p.id])).filter(score => !isNaN(score));
        let minScore = -1, maxScore = -1;
        if (allScores.length > 1) { // Only highlight if there's more than one grade to compare
            minScore = Math.min(...allScores);
            maxScore = Math.max(...allScores);
        }

            semesters.forEach(semesterPeriods => {
                const semesterScores = semesterPeriods.map(p => parseFloat(subjectGrade[p.id]) || 0);
                semesterScores.forEach(score => {
                let classList = '';
                if (score < 60) classList += ' failing-score';
                if (score === maxScore && maxScore !== minScore) classList += ' highest-score';
                if (score === minScore && maxScore !== minScore) classList += ' lowest-score';

                rowHTML += `<td class="${classList.trim()}">${gradeFormatToggle.checked ? score : getLetterGrade(score)}</td>`;
                });

                const semesterAvg = semesterScores.length > 0 ? semesterScores.reduce((a, b) => a + b, 0) / semesterScores.length : 0;
                semesterAverages.push(semesterAvg);
                if (semesterPeriods.length > 0) {
                    rowHTML += `<td data-label="Sem ${semesters.indexOf(semesterPeriods) + 1} Avg" class="${semesterAvg < 60 ? 'failing-score' : ''}">${formatGrade(semesterAvg)}</td>`;
                }
            });

            const finalAvg = semesterAverages.length > 0 ? semesterAverages.reduce((a, b) => a + b, 0) / semesterAverages.length : 0;
            rowHTML += `<td data-label="Final Avg" class="${finalAvg < 60 ? 'failing-score' : ''}">${formatGrade(finalAvg)}</td></tr>`;
            bodyHTML += rowHTML;

            if (subjectGrade.comment && subjectGrade.comment.trim() !== '') {
                const colspan = document.querySelector('#gradeTable thead tr')?.cells.length || 1;
                bodyHTML += `<tr class="comment-row"><td colspan="${colspan}"><span class="comment-label">Comment:</span> ${subjectGrade.comment}</td></tr>`;
            }
        });
        return bodyHTML;
    }

    /**
     * Builds the HTML for the table footer (tfoot) with period and semester averages.
     * @param {Array<Object>} grades - The array of grade data for the student.
     * @param {Array<Array<Object>>} semesters - An array of semester arrays.
     * @returns {string} The inner HTML for the tfoot element.
     */
    function buildTableFooter(grades, semesters) {
        let footerHTML = '<tr><th class="subject-col">Average</th>';
        const overallSemesterAverages = [];

        semesters.forEach(semesterPeriods => {
            const periodAverages = [];
            semesterPeriods.forEach(p => {
                const periodTotal = grades.reduce((sum, current) => sum + (parseFloat(current[p.id]) || 0), 0);
                const avg = grades.length > 0 ? periodTotal / grades.length : 0;
                footerHTML += `<td data-label="${p.name}" class="${avg < 60 ? 'failing-score' : ''}">${formatGrade(avg)}</td>`;
                periodAverages.push(avg);
            });

            const overallSemesterAvg = periodAverages.length > 0 ? periodAverages.reduce((a, b) => a + b, 0) / periodAverages.length : 0;
            overallSemesterAverages.push(overallSemesterAvg);
            if (semesterPeriods.length > 0) {
                footerHTML += `<td data-label="Sem ${semesters.indexOf(semesterPeriods) + 1} Avg" class="${overallSemesterAvg < 60 ? 'failing-score' : ''}">${formatGrade(overallSemesterAvg)}</td>`;
            }
        });

        const finalOverallAvg = overallSemesterAverages.length > 0 ? overallSemesterAverages.reduce((a, b) => a + b, 0) / overallSemesterAverages.length : 0;
        footerHTML += `<td data-label="Final Avg" class="${finalOverallAvg < 60 ? 'failing-score' : ''}">${formatGrade(finalOverallAvg)}</td>`;
        
        // Set Overall Performance Comment based on this final average
        setOverallPerformance(finalOverallAvg);

        return footerHTML;
    }

    // --- Report Card Display Logic ---
    function displayReportCard(studentData, studentId) {
        document.getElementById('student-info-name').textContent = studentData.name;
        document.getElementById('student-info-id').textContent = studentData._id || studentId;

        const grades = studentData.grades;
        const tableHead = document.querySelector('#gradeTable thead');
        const tableBody = document.getElementById('grades-body');
        const tableFoot = document.querySelector('#gradeTable tfoot');
        
        // Ensure table is wrapped for responsiveness
        const table = document.getElementById('gradeTable');
        if (table && !table.parentElement.classList.contains('table-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }

        if (!grades || grades.length === 0) {
            tableHead.innerHTML = '';
            tableFoot.innerHTML = '';
            tableBody.innerHTML = '<tr><td colspan="100%">No grades found.</td></tr>';
            return;
        }

        // 1. Dynamically determine active periods and their names from the data
        const activePeriods = [];
        const firstSubject = grades[0];
        for (const key in firstSubject) {
            if (key !== 'subject' && key !== 'comment' && key !== '_id') {
                const isExam = key.startsWith('exam');
                const num = parseInt(key.replace(/\D/g, '')) || '';
                const name = isExam ? `Exam ${num}` : `${num}${getOrdinalSuffix(num)} Period`;
                activePeriods.push({ id: key, name: name, type: isExam ? 'exam' : 'period' });
            }
        }

        // 2. Group periods into semesters
        const semesters = groupPeriodsIntoSemesters(activePeriods);

        // 3. Build and render all parts of the table
        tableHead.innerHTML = buildTableHeader(semesters);
        tableBody.innerHTML = buildTableBody(grades, semesters);
        tableFoot.innerHTML = buildTableFooter(grades, semesters);

        // 4. Set the print date
        const today = new Date();
        document.getElementById('report-date').textContent = today.toLocaleDateString();
    }

    function setOverallPerformance(finalAvg) {
        const gradeSpan = document.getElementById('overall-grade');
        const commentP = document.getElementById('overall-comment');
        const showNumberGrades = gradeFormatToggle.checked;
        let comment = '';

        if (finalAvg >= 90) {
            comment = 'Excellent work! Keep up the outstanding performance.';
        } else if (finalAvg >= 80) {
            comment = 'Great job! Consistently strong performance.';
        } else if (finalAvg >= 70) {
            comment = 'Good effort. Continue to work hard.';
        } else if (finalAvg >= 60) {
            comment = 'Satisfactory. There is room for improvement.';
        } else {
            comment = 'Needs improvement. Please see the administration for guidance.';
        }

        if (showNumberGrades) {
            gradeSpan.textContent = finalAvg.toFixed(2);
        } else {
            gradeSpan.textContent = getLetterGrade(finalAvg);
        }
        commentP.textContent = comment;
    }

    function getOrdinalSuffix(i) {
        if (!i) return "";
        const j = i % 10,
            k = i % 100;
        if (j === 1 && k !== 11) return "st";
        if (j === 2 && k !== 12) return "nd";
        if (j === 3 && k !== 13) return "rd";
        return "th";
    }

});