// Course Section B - Question 9 - Incremental learning module, separate from the JavaScript API
// Course Section B - Question 10 - Primitives, unions, optional values and executable functions
type RequestStatus = 'pending' | 'accepted' | 'rejected';
// Course Section B - Question 14 - Explicit annotations, interface and inferred values
interface PublicUser { id: string; name: string; username?: string; }
interface Message { content: string; sender?: PublicUser; isRead: boolean; }
// Course Section B - Question 13 - Typed objects and arrays
const sender: PublicUser = { id: 'synthetic', name: 'Student' };
const messages: Message[] = [{ content: 'Hello', sender, isRead: false }];
const status: RequestStatus = 'accepted';
const optionalName: string | null | undefined = sender.username;
function summarize(items: Message[], page: number = 1): string {
  const count = items.length;
  return `Page ${page}: ${count} messages`;
}
console.log(summarize(messages), status, optionalName ?? 'No username');
export { PublicUser, Message, RequestStatus, summarize };
