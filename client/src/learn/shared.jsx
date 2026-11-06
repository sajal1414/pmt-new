// Helpers the learner pages share with the instructor area.
import { platformIcon } from '../lib/constants.js';
export { Loading, ErrorNote, shortDate, ago, Avatar, Stars, Menu, num } from '../teach/lib.jsx';
export const platformIconOf = (name) => platformIcon(name) || 'book';
