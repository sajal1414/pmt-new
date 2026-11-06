import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom';
import './styles.css';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Instructors from './pages/Instructors.jsx';
import ImportPage from './pages/ImportPage.jsx';
import Users from './pages/Users.jsx';
import Login from './pages/Login.jsx';
import SchedulePage from './components/SchedulePage.jsx';
import Requests from './pages/Requests.jsx';
import { DataProvider, ToastProvider } from './lib/store.jsx';
import { AuthProvider, RequireAuth, useAuth } from './lib/auth.jsx';
import { TeachProvider, useTeach } from './teach/lib.jsx';
import TeachLayout from './teach/TeachLayout.jsx';
import TDashboard from './teach/pages/Dashboard.jsx';
import TCourses from './teach/pages/Courses.jsx';
import TStudents from './teach/pages/Students.jsx';
import TAnalytics from './teach/pages/Analytics.jsx';
import TMessages from './teach/pages/Messages.jsx';
import TReviews from './teach/pages/Reviews.jsx';
import TCertificates from './teach/pages/Certificates.jsx';
import TResources from './teach/pages/Resources.jsx';
import TProfile from './teach/pages/Profile.jsx';
import { LearnProvider } from './learn/lib.jsx';
import LearnLayout from './learn/LearnLayout.jsx';
import LDashboard from './learn/pages/Dashboard.jsx';
import LMyLearning from './learn/pages/MyLearning.jsx';
import LExplore from './learn/pages/Explore.jsx';
import LCourse from './learn/pages/Course.jsx';
import LCertificates from './learn/pages/Certificates.jsx';
import LWishlist from './learn/pages/Wishlist.jsx';
import LMessages from './learn/pages/Messages.jsx';
import LReviews from './learn/pages/Reviews.jsx';
import LProfile from './learn/pages/Profile.jsx';
import LContact from './learn/pages/Contact.jsx';
import LAdvisor from './learn/advisor/Advisor.jsx';
import AEnrollments from './admin/pages/Enrollments.jsx';
import AContent from './admin/pages/Content.jsx';
import AAssignments from './admin/pages/Assignments.jsx';
import AReviews from './admin/pages/Reviews.jsx';
import ACertificates from './admin/pages/Certificates.jsx';
import AReports from './admin/pages/Reports.jsx';
import APayments from './admin/pages/Payments.jsx';
import ANotifications from './admin/pages/Notifications.jsx';
import ASettings from './admin/pages/Settings.jsx';
import AHelp from './admin/pages/Help.jsx';
import AWebsiteApi from './admin/pages/WebsiteApi.jsx';

function AdminOnly({ children }) {
  return useAuth().user?.role === 'Admin' ? children : <div className="empty"><b>Only admins can open this page</b><a className="btn sm" href="/">Go home</a></div>;
}
/** Each role has its own area: admins `/`, instructors `/teach`, learners `/learn`. */
const HOME = { Admin: '/', Instructor: '/teach', Learner: '/learn' };
function Area({ allow, children }) {
  const role = useAuth().user?.role;
  return allow.includes(role) ? children : <Navigate to={HOME[role] || '/login'} replace />;
}
function TeachCourse() {
  const { q } = useTeach();
  const { id } = useParams();
  return <CourseDetail key={id} back={q('/teach/courses')} />;
}
function TeachSchedule() {
  const { q } = useTeach();
  return <SchedulePage teach courseUrl={(id) => q('/teach/courses/' + id)} />;
}
function TeachNewCourse() {
  const { q } = useTeach();
  return <CourseDetail key="new" create back={q('/teach/courses')} />;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/teach',
    element: <RequireAuth><Area allow={['Instructor']}><DataProvider><TeachProvider><TeachLayout /></TeachProvider></DataProvider></Area></RequireAuth>,
    children: [
      { index: true, element: <TDashboard /> },
      { path: 'courses', element: <TCourses /> },
      { path: 'courses/new', element: <TeachNewCourse /> },
      { path: 'courses/:id', element: <TeachCourse /> },
      { path: 'schedule', element: <TeachSchedule /> },
      { path: 'students', element: <TStudents /> },
      { path: 'analytics', element: <TAnalytics /> },
      { path: 'messages', element: <TMessages /> },
      { path: 'reviews', element: <TReviews /> },
      { path: 'certificates', element: <TCertificates /> },
      { path: 'resources', element: <TResources /> },
      { path: 'profile', element: <TProfile /> },
      { path: '*', element: <div className="empty"><b>Page not found</b><a className="btn sm" href="/teach">Go to dashboard</a></div> }
    ]
  },
  {
    path: '/learn',
    element: <RequireAuth><Area allow={['Learner']}><LearnProvider><LearnLayout /></LearnProvider></Area></RequireAuth>,
    children: [
      { index: true, element: <LDashboard /> },
      { path: 'my-learning', element: <LMyLearning /> },
      { path: 'explore', element: <LExplore /> },
      { path: 'courses/:id', element: <LCourse /> },
      { path: 'certificates', element: <LCertificates /> },
      { path: 'wishlist', element: <LWishlist /> },
      { path: 'messages', element: <LMessages /> },
      { path: 'reviews', element: <LReviews /> },
      { path: 'profile', element: <LProfile /> },
      { path: 'contact', element: <LContact /> },
      { path: 'advisor', element: <LAdvisor /> },
      { path: '*', element: <div className="empty"><b>Page not found</b><a className="btn sm" href="/learn">Go to dashboard</a></div> }
    ]
  },
  {
    path: '/',
    element: <RequireAuth><Area allow={['Admin']}><DataProvider><Layout /></DataProvider></Area></RequireAuth>,
    children: [
      { index: true, element: <Home /> },
      { path: 'courses', element: <Courses /> },
      { path: 'courses/new', element: <CourseDetail key="new" create /> },
      { path: 'courses/import', element: <ImportPage key="courses" kind="courses" /> },
      { path: 'courses/:id', element: <CourseDetail /> },
      { path: 'schedule', element: <SchedulePage courseUrl={(id) => '/courses/' + id} /> },
      { path: 'requests', element: <Requests /> },
      { path: 'instructors', element: <Instructors /> },
      { path: 'instructors/import', element: <ImportPage key="instructors" kind="instructors" /> },
      { path: 'users', element: <AdminOnly><Users /></AdminOnly> },
      { path: 'enrollments', element: <AEnrollments /> },
      { path: 'content', element: <AContent /> },
      { path: 'assignments', element: <AAssignments /> },
      { path: 'reviews', element: <AReviews /> },
      { path: 'certificates', element: <ACertificates /> },
      { path: 'reports', element: <AReports /> },
      { path: 'payments', element: <APayments /> },
      { path: 'notifications', element: <ANotifications /> },
      { path: 'website-api', element: <AWebsiteApi /> },
      { path: 'settings', element: <ASettings /> },
      { path: 'help', element: <AHelp /> },
      { path: '*', element: <div className="empty"><b>Page not found</b><a className="btn sm" href="/">Go home</a></div> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
);
