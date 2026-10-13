/** 置中的小字提示：「小明 進來了」「小明 收回了一則訊息」 */
export function SystemNotice({ text }: { text: string }) {
  return (
    <div className="pill-line">
      <span>{text}</span>
    </div>
  );
}
