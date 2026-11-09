import { blankCourse, splitList } from './constants.js';

// Example records with fictional people. Replace them by importing your own spreadsheets.
export function seed() {
  const I = [
    ['Priya Raman', 'priya.raman@example.com', 'India', 'Can Travel', 'IBM', 'Data', 'Data Integration', 'DataStage', 'DataStage, Knowledge Catalog, watsonx.data', 'NFC001, HAZ-DA-041, HAZ-DA-058', 'English, Hindi', 4.8],
    ['Daniel Okafor', 'daniel.okafor@example.com', 'United Kingdom', 'Virtual Only', 'IBM', 'Security', 'Threat Management', 'QRadar', 'QRadar SIEM, QRadar SOAR', 'HAZ-SE-004, HAZ-SE-027', 'English', 4.6],
    ['Lena Hoffmann', 'lena.hoffmann@example.com', 'Germany', 'Both', 'Red Hat', 'Cloud, Integration', 'Hybrid Cloud', 'OpenShift', 'OpenShift, Cloud Pak for Integration', 'HAZ-CL-003, HAZ-CL-008, HAZ-CL-014', 'English, German', 4.9],
    ['Marcus Webb', 'marcus.webb@example.com', 'United States', 'Can Travel', 'IBM', 'Automation', 'Integration', 'webMethods', 'webMethods, Business Automation Workflow', 'HAZ-AU-011, HAZ-AU-023', 'English', 4.5],
    ['Aiko Tanaka', 'aiko.tanaka@example.com', 'Japan', 'Virtual Only', 'IBM', 'Data', 'Business Analytics', 'Cognos Analytics', 'Cognos Analytics, Planning Analytics', 'HAZ-DA-030, HAZ-DA-052', 'English, Japanese', 4.7],
    ['Rahul Menon', 'rahul.menon@example.com', 'India', 'In Person Only', 'IBM', 'IT Infrastructure, Automation', 'Mainframe', 'z/OS', 'z/OS, Z Workload Scheduler, Workload Automation', 'HAZ-IF-002, HAZ-ZO-001, HAZ-V-009', 'English, Malayalam', 4.4],
    ['Sofia Alvarez', 'sofia.alvarez@example.com', 'Spain', 'Both', 'IBM', 'Security', 'Data Security', 'Guardium', 'Guardium, IBM Verify', 'HAZ-SE-009, HAZ-SE-015, HAZ-SE-031', 'English, Spanish', ''],
    ['Thomas Brennan', 'thomas.brennan@example.com', 'Ireland', 'Can Travel', 'IBM', 'Integration', 'Messaging', 'IBM MQ', 'IBM MQ, App Connect Enterprise, DataPower', 'HAZ-IN-005, HAZ-IN-010', 'English', 4.8],
    ['Nadia Haddad', 'nadia.haddad@example.com', 'United Arab Emirates', 'Virtual Only', 'IBM', 'AI', 'watsonx', 'watsonx.ai', 'watsonx.ai, watsonx.governance', 'HAZ-DA-012, HAZ-DA-021', 'English, Arabic', 4.9],
    ['Jonas Lindqvist', 'jonas.lindqvist@example.com', 'Sweden', 'Both', 'IBM', 'IT Infrastructure', 'Storage', 'IBM Power', 'IBM Power, Storage Scale, Storage Protect', 'HAZ-IF-007, HAZ-IF-013', 'English, Swedish', ''],
    ['Grace Mensah', 'grace.mensah@example.com', 'South Africa', 'Can Travel', 'IBM', 'Cloud', 'Observability', 'Instana', 'Instana, Turbonomic', 'HAZ-CL-019, HAZ-CL-024', 'English', 4.3],
    ['Arjun Desai', 'arjun.desai@example.com', 'India', 'Virtual Only', 'IBM', 'Data, IT Infrastructure', 'Databases', 'Db2', 'Db2, Netezza, SPSS Modeler', 'HAZ-DA-034, HAZ-DA-047', 'English, Gujarati', 4.6]
  ];
  const instructors = I.map((r, i) => ({ id: 'i' + (i + 1), name: r[0], email: r[1], location: r[2], travel: r[3], vendor: r[4], platforms: splitList(r[5]), portfolio: r[6], product: r[7], skills: r[8], canTeach: r[9], languages: r[10], rating: r[11], comments: '' }));
  const C = [
    ['NFC001', 'IBM DataStage NextGen on IBM Cloud Pak for Data v4.9', 'Data', 'Data Management', 'DataStage', 'Available', 4, [0, 11]],
    ['HAZ-DA-012', 'IBM watsonx.ai Foundations', 'AI', 'watsonx', 'watsonx.ai', 'Available', 2, [8]],
    ['HAZ-DA-021', 'IBM watsonx.governance for AI Risk Teams', 'AI', 'watsonx', 'watsonx.governance', 'For Review', 2, [8]],
    ['HAZ-DA-030', 'IBM Cognos Analytics 12 Report Authoring', 'Data', 'Business Analytics', 'Cognos Analytics', 'Published', 3, [4]],
    ['HAZ-DA-034', 'IBM Db2 12 Database Administration', 'Data', 'Databases', 'Db2', 'In Development', 4, [11]],
    ['HAZ-DA-041', 'IBM watsonx.data Lakehouse Essentials', 'Data', 'Data Management', 'watsonx.data', 'Pipeline', 2, [0]],
    ['HAZ-DA-047', 'IBM SPSS Modeler Predictive Analytics', 'Data', 'Business Analytics', 'SPSS Modeler', 'Backlog', 3, [11]],
    ['HAZ-SE-004', 'IBM Security QRadar SIEM Foundations', 'Security', 'Threat Management', 'QRadar', 'Available', 3, [1]],
    ['HAZ-SE-009', 'IBM Security Guardium Data Protection', 'Security', 'Data Security', 'Guardium', 'In Progress', 4, [6]],
    ['HAZ-SE-015', 'IBM Security Verify Access Deployment', 'Security', 'Identity & Access', 'IBM Verify', 'Pipeline', 3, [6]],
    ['HAZ-CL-003', 'Red Hat OpenShift Administration I', 'Cloud', 'Hybrid Cloud', 'OpenShift', 'Available', 4, [2, 10]],
    ['HAZ-CL-014', 'IBM Cloud Pak for Integration Installation', 'Cloud', 'Integration', 'Cloud Pak for Integration', 'In Development', 3, [2]],
    ['HAZ-CL-024', 'IBM Instana Observability Essentials', 'Cloud', 'Observability', 'Instana', 'Backlog', 2, [10]],
    ['HAZ-ZO-054', 'IBM watsonx Code Assistant for z (Inter or Adv)', 'Z', 'Mainframe', 'watsonx Code Assistant for Z', 'Pipeline', 1, []],
    ['HAZ-V-009', 'IBM Z Workload Scheduler (ZWS) Programming Language Training', 'IT Infrastructure', 'Mainframe', 'Z Workload Scheduler', 'Available', 2, [5]],
    ['HAZ-AU-011', 'IBM webMethods Integration Server Development', 'Automation', 'Integration', 'webMethods', 'For Review', 4, [3]],
    ['HAZ-IN-010', 'IBM MQ 9.3 System Administration', 'Automation', 'Integration', 'IBM MQ', 'Published', 4, [7]],
    ['HAZ-IN-026', 'IBM DataPower Gateway Configuration', 'Automation', 'Integration', 'DataPower', 'Retired', 3, [7]],
    ['HAZ-IF-007', 'IBM Power10 Systems Administration', 'IT Infrastructure', 'Storage', 'IBM Power', 'Draft', 4, [9]],
    ['HAZ-SU-004', 'IBM Maximo Application Suite Manage Fundamentals', 'Sustainability', 'Asset Management', 'Maximo', 'Available', 3, []]
  ];
  const base = Date.UTC(2026, 0, 5);
  const courses = C.map((r, i) => blankCourse({
    id: 'c' + (i + 1), code: r[0], name: r[1], vendor: /^Red Hat/.test(r[1]) ? 'Red Hat' : 'IBM', platform: r[2], portfolio: r[3], product: r[4], status: r[5],
    duration: r[6], hours: r[6] * 8, delivery: 'ILT', instructors: r[7].map((j) => I[j][0]), skill: ['Foundational', 'Intermediate', 'Advanced'][i % 3],
    outlineStatus: r[5] === 'Retired' ? '' : i % 4 === 3 ? 'Draft' : 'Validated', outline: i % 4 === 3 || r[5] === 'Retired' ? '' : 'https://example.com/outlines/' + r[0].toLowerCase() + '.pdf',
    created: new Date(base + i * 7 * 864e5).toISOString().slice(0, 10), labLocation: i % 2 ? 'ITZ' : 'Hazdemy', ipOwner: 'Hazdemy',
    description: 'Hands-on, instructor-led training on ' + r[4] + ' for enterprise teams, combining concepts with guided labs.'
  }));
  courses[0].lessons = [
    { id: 'l1', title: 'Introduction to DataStage NextGen and Cloud Pak for Data', mins: 45, video: 'https://example.com/videos/ds-intro', attachment: '', article: 'Platform overview, architecture and where DataStage fits in the data fabric.' },
    { id: 'l2', title: 'Building your first ETL flow', mins: 90, video: '', attachment: 'https://example.com/labs/ds-lab1.pdf', article: 'Guided lab: connect sources, transform and load to a target table.' },
    { id: 'l3', title: 'Parallel jobs, partitioning and performance', mins: 75, video: '', attachment: '', article: '' }
  ];
  const adminEmail = String(process.env.ATLAS_ADMIN_EMAIL || 'admin@hazdemy.example').trim().toLowerCase();
  const users = [{ id: 'u1', name: 'Hazdemy Admin', email: adminEmail, role: 'Admin', status: 'Active', instructorId: '' }]
    .concat(instructors.map((x, i) => ({ id: 'u' + (i + 2), name: x.name, email: x.email, role: 'Instructor', status: i % 3 === 0 ? 'Password pending' : 'Active', instructorId: x.id })));
  const now = Date.now();
  return {
    v: 1, seq: 1000, courses, instructors, users,
    activity: [
      { t: now - 36e5 * 2, text: 'IBM watsonx.ai Foundations moved to Available', read: false },
      { t: now - 36e5 * 30, text: 'Lessons added to IBM DataStage NextGen', read: true }
    ]
  };
}

/** Example courses, instructors and learners only when ATLAS_SAMPLE_DATA=1 (demos and local testing). */
export const sampleMode = () => process.env.ATLAS_SAMPLE_DATA === '1';

/**
 * Data for a real site: no courses, instructors or learners, only an admin account to sign in with.
 * `keepAdmins` (the admin accounts of the data being replaced) keeps the people resetting the data signed in.
 */
export function emptyData(keepAdmins = []) {
  const admins = keepAdmins.filter((u) => u.role === 'Admin');
  const email = String(process.env.ATLAS_ADMIN_EMAIL || 'admin@hazdemy.example').trim().toLowerCase();
  return {
    v: 1, seq: 1000, courses: [], instructors: [],
    users: admins.length ? admins : [{ id: 'u1', name: 'Hazdemy Admin', email, role: 'Admin', status: 'Active', instructorId: '' }],
    activity: [], students: [], enrollments: [], reviews: [], threads: [], resources: [], views: {}, payments: [], securityLog: [],
    learningReady: true, sampleLearning: false
  };
}
