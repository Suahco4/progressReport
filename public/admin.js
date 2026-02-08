// --- Global Variables & Functions ---
// These are placed in the global scope so they can be accessed by other scripts if needed.

let activePeriods = [];

function getDefaultPeriods() {
    return [
        { id: 'p1', name: '1st Period', type: 'period' }, { id: 'p2', name: '2nd Period', type: 'period' }, { id: 'p3', name: '3rd Period', type: 'period' }, { id: 'exam1', name: '1st Semester', type: 'exam' }, { id: 'sem1', name: '1st Sem Avg', type: 'semester' }, { id: 'p4', name: '4th Period', type: 'period' }, { id: 'p5', name: '5th Period', type: 'period' }, { id: 'p6', name: '6th Period', type: 'period' }, { id: 'exam2', name: '2nd Semester', type: 'exam' }, { id: 'sem2', name: '2nd Sem Avg', type: 'semester' }
    ];
}

function renderAllDynamicSections() {
    renderPeriodsManagementSection();
    renderGradesSection(collectCurrentGrades()); // Pass current grades to re-populate
    renderOverallAveragesSection();
    calculateAndDisplayAverages();
}

// Helper to collect current grades from the form. Needed by renderAllDynamicSections.
function collectCurrentGrades() {
    const currentGrades = [];
    const subjectNameGroups = document.getElementById('subject-names-container').querySelectorAll('.subject-name-group');
    subjectNameGroups.forEach((subjectGroup, subjectIndex) => {
        const subjectId = subjectIndex + 1;
        const subjectNameInput = subjectGroup.querySelector(`#sub${subjectId}-name`);
        const subjectCommentInput = subjectGroup.querySelector(`#sub${subjectId}-comment`);
        if (subjectNameInput && subjectCommentInput) {
            const grade = { subject: subjectNameInput.value.trim(), comment: subjectCommentInput.value.trim() };
            activePeriods.forEach(period => {
                const input = document.getElementById(`sub${subjectId}-${period.id}`);
                grade[period.id] = parseFloat(input?.value) || 0;
            });
            currentGrades.push(grade);
        }
    });
    return currentGrades;
}

function renderPeriodsManagementSection() {
    const activePeriodsContainer = document.getElementById('active-periods-container');
    if (!activePeriodsContainer) return;
    activePeriodsContainer.innerHTML = '';
    activePeriods.forEach(period => {
        const periodBtnHTML = `
            <div class="period-tag">
                <span>${period.name}</span>
                <button type="button" class="remove-period-btn" data-period-id="${period.id}">x</button>
            </div>
        `;
        activePeriodsContainer.insertAdjacentHTML('beforeend', periodBtnHTML);
    });
}

function renderGradesSection(gradesData = []) {
    const gradesByPeriodSection = document.getElementById('grades-by-period-section');
    const subjectNamesContainer = document.getElementById('subject-names-container');
    if (!gradesByPeriodSection || !subjectNamesContainer) return;

    gradesByPeriodSection.innerHTML = '';
    const subjectInputs = subjectNamesContainer.querySelectorAll('.subject-name-group');
    const numSubjects = subjectInputs.length;

    activePeriods.forEach(period => { // Use activePeriods here
        let gradeInputsHTML = '';
        for (let i = 1; i <= numSubjects; i++) {
            const subjectName = document.getElementById(`sub${i}-name`)?.value || `Subject ${i}`;
            const value = gradesData[i - 1]?.[period.id] || 90;
            gradeInputsHTML += `
                <div class="form-group small">
                    <label for="sub${i}-${period.id}">${subjectName}:</label>
                    <input type="number" id="sub${i}-${period.id}" data-subject-index="${i}" data-period="${period.id}" min="0" max="100" value="${value}" required>
                </div>
            `;
        }

        const periodSectionHTML = `
            <div class="period-grade-group">
                <h4>${period.name}</h4>
                <div class="score-row">${gradeInputsHTML}</div>
            </div>
        `;
        gradesByPeriodSection.insertAdjacentHTML('beforeend', periodSectionHTML);
    });
}

function renderOverallAveragesSection() {
    const overallAveragesDisplay = document.getElementById('overall-averages-display');
    if (!overallAveragesDisplay) return;
    overallAveragesDisplay.innerHTML = '';
    activePeriods.forEach(period => {
        const avgBoxHTML = `
            <div class="avg-box">
                <span>${period.name}</span>
                <strong id="avg-${period.id}">0.00</strong>
            </div>
        `;
        overallAveragesDisplay.insertAdjacentHTML('beforeend', avgBoxHTML);
    });
}

// Calculate and display averages for each period
function calculateAndDisplayAverages() {
    const subjectNamesContainer = document.getElementById('subject-names-container');
    const numSubjects = subjectNamesContainer.children.length || 1;
    const totals = {};
    activePeriods.forEach(period => totals[period.id] = 0); // Initialize totals for active periods

    for (let i = 1; i <= numSubjects; i++) {
        activePeriods.forEach(period => {
            const input = document.getElementById(`sub${i}-${period.id}`);
            if (input) {
                totals[period.id] += parseFloat(input.value) || 0;
            }
        });
    }

    activePeriods.forEach(period => {
        const average = totals[period.id] / numSubjects;
        const avgElement = document.getElementById(`avg-${period.id}`);
        avgElement.textContent = average.toFixed(2);

        // Add or remove the failing class based on the score
        if (average < 60) {
            avgElement.classList.add('failing-score');
        } else {
            avgElement.classList.remove('failing-score');
        }
    });

    // Calculate Semester 1 and Semester 2 averages based on available periods
    const sem1Periods = activePeriods.filter(p => p.id === 'p1' || p.id === 'p2' || p.id === 'p3' || p.id === 'exam1');
    const sem2Periods = activePeriods.filter(p => p.id === 'p4' || p.id === 'p5' || p.id === 'p6' || p.id === 'exam2');
    const sumSem1 = sem1Periods.reduce((sum, p) => sum + (totals[p.id] || 0), 0);
    const sumSem2 = sem2Periods.reduce((sum, p) => sum + (totals[p.id] || 0), 0);
    const sem1Avg = (sem1Periods.length > 0) ? (sumSem1 / numSubjects / sem1Periods.length) : 0;
    const sem2Avg = (sem2Periods.length > 0) ? (sumSem2 / numSubjects / sem2Periods.length) : 0;
    const finalAvg = (sem1Avg + sem2Avg) / 2;
    const sem1El = document.getElementById('avg-sem1');
    const sem2El = document.getElementById('avg-sem2');
    const finalEl = document.getElementById('avg-final');
    sem1El.textContent = sem1Avg.toFixed(2);
    sem1Avg < 60 ? sem1El.classList.add('failing-score') : sem1El.classList.remove('failing-score');
    sem2El.textContent = sem2Avg.toFixed(2);
    sem2Avg < 60 ? sem2El.classList.add('failing-score') : sem2El.classList.remove('failing-score');
    finalEl.textContent = finalAvg.toFixed(2);
    finalAvg < 60 ? finalEl.classList.add('failing-score') : finalEl.classList.remove('failing-score');
}

// --- API Communication Layer ---
const API_BASE_URL = ''; // Use relative paths, works for dev and prod
const adminForm = document.getElementById('admin-form');
const adminMessage = document.getElementById('admin-message');

// Helper to get the Firebase ID Token
async function getAuthToken() {
    if (window.firebase && firebase.auth() && firebase.auth().currentUser) {
        return await firebase.auth().currentUser.getIdToken();
    }
    return null;
}

// Function to Fetch a single student's data from the backend
async function getStudent(id) {
    const response = await fetch(`${API_BASE_URL}/api/students/${id}`);
    if (!response.ok) {
        throw new Error('Student not found');
    }
    return await response.json();
}

// Function to Fetch ALL students for the logged-in user
async function fetchStudents() {
    const token = await getAuthToken();
    if (!token) {
        // console.warn("fetchStudents called but no auth token found.");
        throw new Error("Authentication required to fetch students.");
    }

    const headers = { 'Authorization': `Bearer ${token}` };
    const response = await fetch(`${API_BASE_URL}/api/students`, { headers });

    if (!response.ok) {
        const errorText = await response.text();
        // console.error("Error fetching students:", response.status, errorText);
        throw new Error('Failed to fetch students list.');
    }
    return await response.json();
}

// Function to Add a NEW Report Card via API
async function addReportCard(studentData) {
    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/students`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(studentData),
    });
    const result = await response.json(); // Contains { success, message } from server
    if (!response.ok) throw new Error(result.message || 'Failed to add student.');
    return result;
}

// Function to Update an EXISTING Report Card via API
async function updateReportCard(id, studentData) {
    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/students/${id}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(studentData),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Failed to update student.');
    return result;
}

// Function to Delete a Report Card via API
async function deleteReportCard(id) {
    const token = await getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/students/${id}`, {
        method: 'DELETE',
        headers: headers,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Failed to delete student.');
    return result;
}

// Form Submit Handler
adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('student-name').value.trim();
    const id = document.getElementById('student-id').value.trim();
    const className = document.getElementById('student-class').value.trim();
    const rollNumber = document.getElementById('student-roll').value.trim();
        const academicYear = document.getElementById('academic-year') ? document.getElementById('academic-year').value.trim() : '';
    const principalComment = document.getElementById('principal-comment').value.trim();
    
    if (!name || !id) {
        showMessage('Please enter name and ID.', false);
        return;
    }
    
    // Collect grades organized by period
    const grades = [];
    
    // Iterate through each subject to collect its grades for all periods
    // Get the active periods from the DOM, as they are dynamically managed in admin.html
    const activePeriodElements = document.querySelectorAll('#overall-averages-display .avg-box strong');
    const periodIds = Array.from(activePeriodElements).map(el => el.id.replace('avg-', ''));
    const subjectNameGroups = document.querySelectorAll('#subject-names-container .subject-name-group');
    subjectNameGroups.forEach((subjectGroup, subjectIndex) => {
        const subjectId = subjectIndex + 1;
        const subjectNameInput = subjectGroup.querySelector(`#sub${subjectId}-name`);
        const subjectCommentInput = subjectGroup.querySelector(`#sub${subjectId}-comment`);
        
        // Ensure the subject name input exists and has a value before processing.
        if (subjectNameInput && subjectNameInput.value.trim() !== '') {
            const grade = {
                subject: subjectNameInput.value.trim(),
                comment: subjectCommentInput ? subjectCommentInput.value.trim() : ''
            };

            // Collect the grades for each active period for this subject
            periodIds.forEach(periodId => {
                const gradeInput = document.querySelector(`#sub${subjectId}-${periodId}`);
                // Ensure input exists before trying to read its value
                grade[periodId] = gradeInput ? (parseFloat(gradeInput.value) || 0) : 0; // Default to 0 if NaN
            });
            
            grades.push(grade);
        }
    });
    
    if (grades.length === 0) {
        showMessage('Please add at least one subject.', false);
        return;
    }
    
    const studentData = {
        id,
        name,
        className,
        rollNumber,
            academicYear,
        principalComment,
        grades
    };

    let result;
    try {
        // Check if we are in "Edit Mode" (the ID input will be read-only)
        if (document.getElementById('student-id').readOnly) {
            result = await updateReportCard(id, studentData);
        } else {
            result = await addReportCard(studentData);
        }
        
        showMessage(result.message, result.success);
        
        if (result.success) {
            // Reset the form completely by clicking the "Cancel Edit" button's logic
            const cancelBtn = document.getElementById('cancel-edit-btn');
            if (!cancelBtn.classList.contains('hidden')) {
                cancelBtn.click();
            } else {
                adminForm.reset();
                window.activePeriods = window.getDefaultPeriods();
                window.renderAllDynamicSections();
            }
        }
    } catch (error) {
        showMessage(error.message, false);
    }
});

// Helper: Show Success/Error Message
function showMessage(text, isSuccess) {
    // console.log(`Firebase Notification [${isSuccess ? 'Success' : 'Error'}]:`, text);
    adminMessage.textContent = text;
    adminMessage.className = `error ${isSuccess ? 'success' : ''}`;  // Toggle class for green/red
    adminMessage.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        adminMessage.classList.add('hidden');
    }, 5000);
}

// Optional: Toggle more subjects (e.g., show Subject 2+ on checkbox)
// For now, manually un-hide in HTML if needed

// --- DOMContentLoaded Event Listener ---
// This is the main entry point for the page's functionality.
document.addEventListener('DOMContentLoaded', function() {
    // --- Element Cache ---
    const generateIdBtn = document.getElementById('generate-id-btn');
    const studentIdInput = document.getElementById('student-id');
    const studentNameInput = document.getElementById('student-name');
    const studentClassInput = document.getElementById('student-class');
    const studentRollInput = document.getElementById('student-roll');
        const academicYearInput = document.getElementById('academic-year');
    const principalCommentInput = document.getElementById('principal-comment');
    const editIdInput = document.getElementById('edit-student-id');
    const loadStudentBtn = document.getElementById('load-student-btn');
    const submitBtn = document.getElementById('submit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const deleteStudentBtn = document.getElementById('delete-student-btn');
    const addSubjectBtn = document.getElementById('add-subject-btn');
    const subjectNamesContainer = document.getElementById('subject-names-container');
    const gradesByPeriodSection = document.getElementById('grades-by-period-section');
    const activePeriodsContainer = document.getElementById('active-periods-container');
    const newPeriodNameInput = document.getElementById('new-period-name-input');
    const addRegularPeriodBtn = document.getElementById('add-regular-period-btn');
    const addExamPeriodBtn = document.getElementById('add-exam-period-btn');
    let subjectCounter = 0;

    // Listen for the custom event fired when the student list is fetched
    document.addEventListener('studentListFetched', (e) => {
        const students = e.detail;
        populateStudentListForEditing(students);
    });

    /**
     * Populates a datalist for the student ID input to make editing easier.
     * @param {Array<Object>} students - Array of student objects with _id and name.
     */
    function populateStudentListForEditing(students = []) {
        const editIdInput = document.getElementById('edit-student-id');
        let datalist = document.getElementById('student-ids-datalist');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'student-ids-datalist';
            editIdInput.parentElement.appendChild(datalist);
        }
        editIdInput.setAttribute('list', 'student-ids-datalist');
        datalist.innerHTML = ''; // Clear existing options
        students.forEach(student => {
            datalist.innerHTML += `<option value="${student._id}">${student.name}</option>`;
        });
    }

    // --- Event Listeners ---
    generateIdBtn.addEventListener('click', function() {
        const year = new Date().getFullYear();
        const randomPart = Math.floor(10000 + Math.random() * 90000);
        studentIdInput.value = `${year}${randomPart}`;
    });

    loadStudentBtn.addEventListener('click', async function() {
        const studentIdToLoad = editIdInput.value.trim();
        if (!studentIdToLoad) {
            alert('Please enter a Student ID to load.');
            return;
        }
        try {
            const studentData = await getStudent(studentIdToLoad);
            studentNameInput.value = studentData.name;
            studentClassInput.value = studentData.className || '';
            studentRollInput.value = studentData.rollNumber || '';
                if (academicYearInput) academicYearInput.value = studentData.academicYear || '';
            principalCommentInput.value = studentData.principalComment || '';
            studentIdInput.value = studentIdToLoad;
            studentIdInput.readOnly = true;
            generateIdBtn.disabled = true;
            setActivePeriodsFromGrades(studentData.grades);
            renderPeriodsManagementSection();
            renderFormFromData(studentData.grades);
            calculateAndDisplayAverages();
            submitBtn.textContent = 'Update Student';
            cancelEditBtn.classList.remove('hidden');
            deleteStudentBtn.classList.remove('hidden');
        } catch (error) {
            alert(error.message || 'No student found with that ID.');
        }
    });

    cancelEditBtn.addEventListener('click', function() {
        adminForm.reset();
        activePeriods = getDefaultPeriods();
        renderPeriodsManagementSection();
        renderFormFromData([{ subject: '' }]);
        studentIdInput.readOnly = false;
        generateIdBtn.disabled = false;
        principalCommentInput.value = '';
        editIdInput.value = '';
        submitBtn.textContent = 'Add Student to Database';
        cancelEditBtn.classList.add('hidden');
        deleteStudentBtn.classList.add('hidden');
        document.getElementById('admin-message').classList.add('hidden');
        calculateAndDisplayAverages();
    });

    deleteStudentBtn.addEventListener('click', async function() {
        const studentIdToDelete = studentIdInput.value;
        const studentName = studentNameInput.value || 'this student';
        if (confirm(`Are you sure you want to permanently delete the record for ${studentName} (ID: ${studentIdToDelete})?\n\nThis action cannot be undone.`)) {
            try {
                const result = await deleteReportCard(studentIdToDelete);
                showMessage(result.message, result.success);
                if (result.success) {
                    cancelEditBtn.click();
                }
            } catch (error) {
                showMessage(error.message, false);
            }
        }
    });

    addSubjectBtn.addEventListener('click', function() {
        addSubjectInput();
        renderGradesSection();
        calculateAndDisplayAverages();
    });

    addRegularPeriodBtn.addEventListener('click', function() {
        addPeriod('period', newPeriodNameInput.value.trim());
        newPeriodNameInput.value = '';
    });

    addExamPeriodBtn.addEventListener('click', function() {
        addPeriod('exam', newPeriodNameInput.value.trim());
        newPeriodNameInput.value = '';
    });

    activePeriodsContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-period-btn')) {
            removePeriod(e.target.dataset.periodId);
        }
    });

    subjectNamesContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-subject-btn')) {
            const subjectGroup = e.target.closest('.subject-name-group');
            if (subjectGroup) {
                subjectGroup.nextElementSibling.remove(); // Remove comment associated with subject
                subjectGroup.remove(); // Remove subject name group
                reindexSubjectNames();
                renderAllDynamicSections();
            }
        }
    });

    gradesByPeriodSection.addEventListener('input', function(e) {
        if (e.target.type === 'number') {
            calculateAndDisplayAverages();
        }
    });

    // --- Helper Functions (Scoped to DOMContentLoaded) ---
    function renderFormFromData(gradesData = []) {
        if (gradesData.length === 0) gradesData.push({ subject: '' });
        subjectNamesContainer.innerHTML = '';
        gradesData.forEach((grade, index) => addSubjectInput(grade, index + 1));
        renderOverallAveragesSection(); // Ensure average boxes are rendered
        renderPeriodsManagementSection();
        renderGradesSection(gradesData);
    }

    function addSubjectInput(subjectData = {}, index) {
        subjectCounter = subjectNamesContainer.children.length / 2 + 1; // Each subject has 2 divs
        const subjectIndex = index || subjectCounter;
        const { subject: name = '', comment = '' } = subjectData;
        const removeButtonHTML = subjectIndex > 1 ? `<button type="button" class="remove-subject-btn" data-index="${subjectIndex}">Remove</button>` : '';
        const subjectInputHTML = `
            <div class="form-group subject-name-group" data-index="${subjectIndex}">
                <label for="sub${subjectIndex}-name">Subject ${subjectIndex} Name:</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="text" id="sub${subjectIndex}-name" placeholder="e.g., History" value="${name}" required>
                    ${removeButtonHTML}
                </div>
            </div>
            <div class="form-group">
                <label for="sub${subjectIndex}-comment">Comment:</label>
                <textarea id="sub${subjectIndex}-comment" rows="2" placeholder="Enter comments for this subject...">${comment}</textarea>
            </div>`;
        subjectNamesContainer.insertAdjacentHTML('beforeend', subjectInputHTML);
    }

    function addPeriod(type, customName = '') {
        let newId, newName;
        if (type === 'period') {
            const periodCount = activePeriods.filter(p => p.type === 'period').length + 1;
            newId = `p${periodCount}`;
            newName = customName || `${periodCount}${getOrdinalSuffix(periodCount)} Period`;
        } else {
            const examCount = activePeriods.filter(p => p.type === 'exam').length + 1;
            newId = `exam${examCount}`;
            newName = customName || `Exam ${examCount}`;
        }
        if (activePeriods.some(p => p.id === newId)) newId = `${type}_${Date.now()}`;
        activePeriods.push({ id: newId, name: newName, type: type });
        renderAllDynamicSections();
    }

    function removePeriod(periodId) {
        if (activePeriods.length <= 1) {
            alert("You must have at least one period.");
            return;
        }
        activePeriods = activePeriods.filter(p => p.id !== periodId);
        renderAllDynamicSections();
    }

    function getOrdinalSuffix(i) {
        const j = i % 10, k = i % 100;
        if (j === 1 && k !== 11) return "st";
        if (j === 2 && k !== 12) return "nd";
        if (j === 3 && k !== 13) return "rd";
        return "th";
    }

    function reindexSubjectNames() {
        const allSubjectGroups = subjectNamesContainer.querySelectorAll('.subject-name-group');
        allSubjectGroups.forEach((group, index) => {
            const newIndex = index + 1;
            group.dataset.index = newIndex;
            const label = group.querySelector('label');
            label.textContent = `Subject ${newIndex} Name:`;
            label.setAttribute('for', `sub${newIndex}-name`);
            group.querySelector('input').id = `sub${newIndex}-name`;
            const commentGroup = group.nextElementSibling;
            const commentLabel = commentGroup.querySelector('label');
            commentLabel.setAttribute('for', `sub${newIndex}-comment`);
            commentGroup.querySelector('textarea').id = `sub${newIndex}-comment`;
            const removeBtn = group.querySelector('.remove-subject-btn');
            if (removeBtn) removeBtn.dataset.index = newIndex;
        });
    }

    function setActivePeriodsFromGrades(gradesData) {
        activePeriods = [];
        if (gradesData.length > 0) {
            const firstSubjectGrades = gradesData[0];
            for (const key in firstSubjectGrades) {
                if (key !== 'subject' && key !== 'comment' && key !== '_id' && key !== '__v') {
                    const type = key.startsWith('exam') ? 'exam' : (key.startsWith('sem') ? 'semester' : 'period');
                    let name = key;
                    if (key.startsWith('p')) {
                        const num = parseInt(key.substring(1));
                        name = `${num}${getOrdinalSuffix(num)} Period`;
                    } else if (key === 'exam1') {
                        name = '1st Semester';
                    } else if (key === 'sem1') {
                        name = '1st Sem Avg';
                    } else if (key === 'exam2') {
                        name = '2nd Semester';
                    } else if (key === 'sem2') {
                        name = '2nd Sem Avg';
                    } else if (key.startsWith('exam')) {
                        name = `Exam ${parseInt(key.substring(4))}`;
                    }
                    activePeriods.push({ id: key, name: name, type: type });
                }
            }
        }
        if (activePeriods.length === 0) activePeriods = getDefaultPeriods();
    }

    // --- Initial Page Load ---
    activePeriods = getDefaultPeriods();
    renderFormFromData(); // Initial render with one blank subject
    calculateAndDisplayAverages();
    initializeFirebase();
});

async function initializeFirebase() {
    try {
        const response = await fetch(`/api/config/firebase`);
        if (!response.ok) {
            throw new Error('Failed to load Firebase configuration');
        }
        const firebaseConfig = await response.json();

        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    // Check if user is Super Admin and redirect if necessary
                    try {
                        const token = await user.getIdToken();
                        const res = await fetch(`${API_BASE_URL}/api/auth/is-superadmin`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (data.isSuperAdmin) {
                            window.location.href = '/superadmin';
                            return;
                        }
                    } catch (e) {
                        console.error("Auth check failed", e);
                    }

                    // console.log('User is signed in. Fetching student list.');
                    try {
                        const students = await fetchStudents();
                        // Fire a custom event with the student data so the DOMContentLoaded listener can handle it
                        document.dispatchEvent(new CustomEvent('studentListFetched', { detail: students }));
                    } catch (error) {
                        // console.error('Error fetching students after login:', error);
                        showMessage(error.message, false);
                    }
                } else {
                    // console.log('No user signed in. Clearing student list.');
                    document.dispatchEvent(new CustomEvent('studentListFetched', { detail: [] }));
                }
            });
        }
    } catch (error) {
        // console.error('Firebase Initialization Error:', error);
        showMessage('System Error: Failed to connect to authentication service.', false);
    }
}