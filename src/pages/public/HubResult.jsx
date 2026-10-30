import { formatDate, formatTime12, waLink } from "../../lib/shared.js";

// What a woman sees after registering, or when she looks up her hub.
export default function HubResult({ info, title }) {
  const { hub } = info;
  return (
    <div className="result">
      <h1>{title}</h1>
      {hub ? (
        <div className="hubcard">
          <p className="muted" style={{ margin: 0 }}>Your prayer hub</p>
          <h2>{hub.name}</h2>
          {hub.leaderName && (
            <p>
              Hub leader: <strong>{hub.leaderName}</strong>
              {hub.leaderPhone && <> · <a href={waLink(hub.leaderPhone)} target="_blank" rel="noopener">{hub.leaderPhone}</a></>}
            </p>
          )}
          {hub.whatsappLink ? (
            <a className="btn whatsapp block" href={hub.whatsappLink} target="_blank" rel="noopener">Join the WhatsApp group</a>
          ) : (
            <p className="note">Your leader will add the WhatsApp group link soon. You can also message her directly.</p>
          )}
        </div>
      ) : (
        <div className="hubcard">
          <h2>Your place is saved</h2>
          <p>We're putting you in a prayer hub in {info.stateName}. Your hub leader will message you on WhatsApp with the group link, usually within a few days.</p>
        </div>
      )}

      <ul className="next">
        {info.telegramLink && (
          <li>Join our Telegram community for announcements. <a href={info.telegramLink} target="_blank" rel="noopener">Open Telegram</a></li>
        )}
        {(info.dailyTime || info.startDate) && (
          <li>
            We pray every day{info.dailyTime ? ` at ${formatTime12(info.dailyTime)} Nigeria time` : ""}
            {info.startDate ? `, starting ${formatDate(info.startDate)}` : ""}.
            {info.zoomLink && <> <a href={info.zoomLink} target="_blank" rel="noopener">Join on Zoom</a></>}
          </li>
        )}
        <li className="muted small">To see this again, open “My hub” on this phone.</li>
      </ul>
    </div>
  );
}
