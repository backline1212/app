import { useNavigate } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { showMoveResult, useMoveResult } from "./move-result";

/** The follow-up after a move: who came off which tickets, and invitations that failed. */
export function MoveResultHost() {
  const result = useMoveResult();
  const navigate = useNavigate();
  if (!result) return null;
  const { outcome, projectName, openPath } = result;
  const close = () => showMoveResult(null);

  return <Dialog title={`“${projectName}” moved to ${outcome.workspace_name}`} onClose={close}>
    <div className="bl-compact-form bl-move-form">
      {outcome.unassigned.length > 0 && <div className="bl-move-notes">
        <p><strong>Unassigned because they are not in {outcome.workspace_name}:</strong></p>
        <ul>
          {outcome.unassigned.map((person, index) => <li key={`${person.name}-${index}`}>
            {person.name}
            {person.ticket_numbers.length > 0 && <>: {person.ticket_numbers.map((n) => `#${n}`).join(", ")}</>}
          </li>)}
        </ul>
        <p>Ticket numbers are the new ones. Invite them and assign the tickets again if needed.</p>
      </div>}
      {outcome.members_added > 0 && <p className="bl-move-line">
        Added {outcome.members_added} {outcome.members_added === 1 ? "member" : "members"} to {outcome.workspace_name}.
      </p>}
      {outcome.invite_emails_failed > 0 && <p role="alert" className="bl-error">
        {outcome.invite_emails_failed === 1 ? "One invitation email" : `${outcome.invite_emails_failed} invitation emails`} could not be sent. Resend from Members.
      </p>}
      <footer className="bl-dialog-actions">
        <button type="button" className="bl-quiet" onClick={() => { close(); navigate(openPath); }}>Open project</button>
        <button type="button" className="bl-button" onClick={close}>Done</button>
      </footer>
    </div>
  </Dialog>;
}
