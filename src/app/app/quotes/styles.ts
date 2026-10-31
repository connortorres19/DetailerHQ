import leadStyles from '../leads/leads.module.css';
import quoteStyles from './quotes.module.css';

// Quote screens use the shared Phase 5 list/detail styles plus their own.
const styles: Record<string, string> = { ...leadStyles, ...quoteStyles };
export default styles;
