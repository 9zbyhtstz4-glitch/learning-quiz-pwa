# 用語から学ぶクイズ — PWA骨組み

## デプロイ時のバージョン更新

タイトル右側の小さい番号が、読み込まれたアプリのバージョンです。
今後の各デプロイ前に `node tools/bump-version.cjs` を1回実行し、index.htmlとsw.jsを変更と一緒にコミット・pushします。
このコマンドは表示番号とキャッシュ番号を同時に1増やします。ビルドや外部依存は不要です。

schema-definition.md v0.2に基づく、外部ライブラリ・npm・ビルド不要のHTML/CSS/JavaScript（ES Modules）アプリです。
問題136件（用語113・関係性23）、用語113件、参考記事20件を同梱しています。出典はClaude公式ドキュメントです。
収録件数はタイトル下に「収録 136問 · 用語 113件」として表示します。data.jsonから毎回数えるため、問題や用語を追加しても書き換えは不要です。

## 分野を絞った出題

収録件数の右にある「分野：すべて」から、出題する分野を1つ選べます。一覧はdata.jsonの問題のfieldIdから毎回作り、各分野の問題数を添えます。
表示名はfields.jsの対応表で決まり、並び順も対応表の順です。新しいfieldIdを使ったら対応表に日本語名を追加してください。追加漏れは`node tools/audit-data.cjs`が警告し、画面では分野IDを出さずに「名称未設定の分野」と表示します。

- 絞り込むのは「次の問題」の自動選択だけです。優先度unseen > due > restingは分野の中で保たれます。
- 問題文の用語タップと用語一覧からの遷移は、分野に関係なく行えます。
- 分野を切り替えても進捗(状態・回答履歴・他問数)は変わりません。他問数は、分野の外で出題された問題も含めて数えます。
- 選んだ分野に出題できる問題がなければ、全問coolingの時と同じく待機案内を出し、用語タップを使い続けられます。待機中に分野を選び直すと、その分野で次の問題を探します。
- 選んだ分野はIndexedDBのsettingsストアに保存し、再起動後も維持します。

## ローカル起動

Node.jsが利用可能な環境で、このフォルダーを作業ディレクトリとして実行します。

```powershell
node tools/serve.cjs
```

ブラウザーで <http://localhost:8080/quiz/> を開きます。停止はターミナルのCtrl+Cです。
Node.jsは開発用の静的サーバーとテスト実行にだけ使用し、アプリの配信・実行には不要です。
任意の静的HTTPサーバーも使用できます。file://での直接起動は使用しないでください。

## GitHub PagesとiPhone

配信対象はルートのHTML/CSS/JS/JSON、icons/、.nojekyllです。tests/とtools/はアプリ実行には不要です。
GitHub Pagesの公開対象ディレクトリに配置してください。URLはすべて相対指定のため、リポジトリ名を含むサブパスでも動作します。
公開URL: https://9zbyhtstz4-glitch.github.io/learning-quiz-pwa/
Publicリポジトリ: https://github.com/9zbyhtstz4-glitch/learning-quiz-pwa
GitHub Pagesはmainブランチのルート（/）を配信します。.nojekyllでJekyll処理を省略し、独自のActionsビルド設定は使用しません。

1. 初回だけオンラインでHTTPSの公開URLをSafariで開く。
2. 「オフライン準備完了」を確認する。
3. Safariの共有メニューからホーム画面に追加する。
4. ホーム画面から起動し、そこで準備完了を確認する。
5. 機内モードにし、Wi-Fiもオフにして再起動・回答・用語遷移を確認する。

アプリ資源はService WorkerのCache Storage、進捗はIndexedDB（learning-quiz / progress）、選択中の分野は同じDBのsettingsストアに保存します。
参考資料の外部リンクだけはオンライン時に使用します。学習処理に通信・外部APIは不要です。
端末・ブラウザーのサイトデータ削除で保存内容も失われます。

## 進捗ルールと設定

config.jsの初期値は30問・7日・maxDepth: 2です(schema-definition.md 6.1節)。出題後24時間の待機条件は2026-09-13に廃止しました。
coolingQuestionCountは収録問題数より小さい必要があります。収録数以上にすると、間に挟む問題が尽きてcoolingがdueに戻らず、全問回答後に待機中のまま復習が再開しません。`node tools/audit-data.cjs`がこの不整合を警告します。
短時間で挙動を確認する場合だけ、次のように変更します。

```js
coolingQuestionCount: 1,
restingDays: 0.001, // 約86秒
maxDepth: 2,
```

キャッシュ済みの設定を更新するには、sw.jsのCACHEバージョン（v4）を増やし、オンラインでページを開いた後、同じアプリのタブ／ウィンドウをすべて閉じて開き直します。更新待ちのService Workerは、既存のアプリを終了すると有効になります。設定変更は既存の進捗にも適用されます。

- 初回出題直後にunseen→cooling。
- cooling→dueは他問数だけが条件で、出題後の経過時間は問わない。出題・回答・次問選択の際に評価して保存。
- dueで連続正答2回以上になるとresting。誤答はdueのまま連続正答数を0に戻す。
- restingは最後の出題から7日経過、または誤答でdueへ戻る。
- 連続正答数は状態をまたいで保持し、誤答時だけ0に戻す。
- 初回・通常出題・用語遷移ごとに対象問題のlastSeenAtを更新し、seenSinceCountを0に戻す。他の既出問題のseenSinceCountは1増やす。
- 同じ問題を再表示しても、その問題自身の「他問数」には加算しない。
- スタック復帰と深さ上限の短い定義表示は出題に数えない。
- 出題優先度はunseen > due > resting。同じ状態の中では最後の出題が古い問題から選ぶ。
- 全問coolingでは直前の画面を維持し、用語タップと用語一覧を使い続けられる。「出題条件を再確認」で通常出題を再試行する。

## スキーマとの対応・補足

エンティティの変更はありません。timestampはUnix時刻のミリ秒、未出題のlastSeenAtはnullで表現しています。
answerHistory.choiceIndexはシャッフル後の位置ではなく、データのchoicesに対応する固定インデックスです。
InterruptStack.stackには{questionId}だけを保存し、選択肢順・回答状態・待機状態は別のセッション内配列で保持します。遷移先が現在の問題または中断スタック内の問題の場合は、遷移せずshortDefinitionのみ表示します。
セッション（ページ再読み込み）をまたぐ中断状態の復元は行いません。再起動時に全問coolingなら閲覧用の問題文と用語一覧を表示します。この閲覧は新しい出題として数えません。
revealAnswer:falseでは、正誤メッセージ・正解位置・正誤色を表示せず、選んだ選択肢とexplanationのみを表示します。正誤は進捗の内部記録に使用します。

## 確認方法

データを追加・変更したら、整形してから点検します。整形は何度実行しても結果が変わりません。

```powershell
node tools/normalize-data.cjs
node tools/audit-data.cjs
```

整形では、問題文の{{term:id}}マーカー前後の半角空白を除き、relatedTermIdsを双方向にそろえます。

必須制約(用語ごとのterm型問題、{{term:id}}とtermIdsの整合、choices3件、answerIndex 0〜2、記事参照の実在、id重複)と、
schema-definition.md 7.3節の自己参照マーカー禁止を検査し、違反をidつきで一覧表示します。
警告としては、5.3節に反するrelationshipのrevealAnswer: true、5.1節が想定する2件に満たないrelationshipのtermIds、select-correct / select-incorrect / select-best以外のpatternType、fields.jsに表示名のないfieldIdも報告します。
あわせてanswerIndex・patternType・type・fieldIdの分布を出力します。エラーがあれば終了コード1で失敗します。

```powershell
node --test "tests/*.test.mjs"
```

状態遷移、他問数と7日の境界、優先度、分野の絞り込み、coolingへのアクセス、短縮設定、シャッフル(progress 10件)、用語タップのフォールバックと分野に依存しない遷移(navigation 5件)、分野一覧の生成と表示名(fields 3件)の計18件を検証します。
サーバー起動中に <http://localhost:8080/tests/storage.html> を開くと、実ブラウザーのIndexedDBで再接続・並行更新・ロールバックの3件を検証できます。テスト専用DBだけを作成・削除し、アプリの進捗は読み取り表示のみ行います。

ブラウザーでの確認手順：

1. 最初の関係性問題に回答し、解説だけ表示されることを確認する。
2. PWA→APIの順に用語をタップし、中断2/2でHTTPをタップする。短い定義のみ表示されることを確認する。
3. APIに回答→戻る→PWAに回答→戻る。正解表示、LIFO復帰、選択肢順、回答済み状態を確認する。
4. 残りの通常問題に回答し、「次の問題」で待機案内が出ることを確認する。
5. 待機中にPWAなどの用語を開いて回答し、戻れることを確認する。
6. オフライン準備完了後、静的サーバーを停止して再読み込みする。用語遷移・回答が動くことを確認する。
7. サーバーを再開し、storage.htmlの読み取り表示で回答履歴が残っていることを確認する。

実施結果はTEST-RESULTS.mdを参照してください。

## スコープ外

円グラフ、本番300問、Gemini/Claude連携、patternTypeによる表示分岐、見た目の作り込みは今回の指定により未実装です。iPhone実機検証は未実施です。
公開先のtests/pwa.htmlではService Worker・必要資源のキャッシュ・manifestを確認できます。ホーム画面追加とネットワーク切断の実機確認とは別の検証です。



