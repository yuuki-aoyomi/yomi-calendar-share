type HelpModalProps = {
  onClose: () => void;
};

// アプリの表示ルールや機能の意味を、設定とは分けて確認するためのヘルプです。
export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="settings-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="ヘルプ"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <h2>ヘルプ</h2>
          <button type="button" className="icon-button" aria-label="ヘルプを閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="help-grid">
          <HelpItem
            title="カレンダーの丸印"
            body="青は予定、琥珀色は未完了ToDo、紫は日記または日別写真、黄色はお金・クレカ引き落とし・給料日、ピンクはラブログや誕生日がある日を表します。"
          />
          <HelpItem
            title="予定カテゴリ"
            body="通常予定、日記、ToDo、詳細、写真メモを分けて一覧表示します。カテゴリは後から検索やAI提案に使いやすくするための分類です。"
          />
          <HelpItem
            title="複数日予定"
            body="予定には終了日を設定できます。複数日にまたがる予定はカレンダーにタグ色の帯で表示され、予定名は開始日にだけ表示します。"
          />
          <HelpItem
            title="ToDo"
            body="ToDoカテゴリの予定は、予定一覧で完了チェックを切り替えられます。未完了ToDoはカレンダー上で優先的に表示されます。"
          />
          <HelpItem
            title="タグと色"
            body="タグは予定に複数付けられます。設定のタグ管理から追加・編集・並び替えができ、User / 人タグは優先表示されます。"
          />
          <HelpItem
            title="誕生日"
            body="User / 人タグには誕生日を設定できます。該当日はカレンダーと予定タブに強調表示されます。"
          />
          <HelpItem
            title="バイト給料"
            body="バイト先設定で時給、締め日、給料日を登録すると、バイトタグ付き予定から勤務時間と給料見込みを計算します。"
          />
          <HelpItem
            title="クレカ引き落とし"
            body="クレカ支出はカードの締め日と支払日から引き落とし予定を計算し、お金タブとカレンダーに表示します。"
          />
          <HelpItem
            title="サブスク"
            body="サブスクは請求日と支払いカードを登録できます。お金タブやまとめの計算に使いますが、カレンダーセルには表示しません。"
          />
          <HelpItem
            title="写真"
            body="写真は予定ごとではなく日ごとに保存します。圧縮目標は約1MBで、圧縮後2MB以下なら追加できます。"
          />
          <HelpItem
            title="バックアップ"
            body="全データを書き出すと、予定・お金・ラブログ・タグ・バイト・クレカ・サブスク設定をJSONとして保存できます。移行や復元の土台です。"
          />
        </div>
      </section>
    </div>
  );
}

function HelpItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="help-item">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}
