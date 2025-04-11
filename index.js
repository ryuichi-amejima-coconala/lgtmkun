const { App, AwsLambdaReceiver } = require('@slack/bolt');

const aistudioReviewer = [
	'U06LJG34X7V', // jima
	'U087G18N284', // しのたつさん
	'U082X9USNCU', // ごろーさん
	'UN9S3A0VD',   // おかぴさん
	'U08K4F0JADS', // はじめちゃん
	'U08LAC91Z6K', // やぎさん
];

const awsLambdaReceiver = new AwsLambdaReceiver({
	signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	receiver: awsLambdaReceiver,
});

app.message('レビュー', async ({ message, say }) => {
	try {
		let currentHour =  new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000)).getHours();

		if (!(currentHour > 6 && currentHour < 19)) return

		let reviewers = aistudioReviewer.concat();
		let messageUser = reviewers.indexOf(message.user)
		reviewers.splice(messageUser, 1)
		const firstReviewer = await selectReviewer(reviewers)

		reviewers.splice(firstReviewer, 1)
		const secondReviewer = await selectReviewer(reviewers)

		await say({ text: `レビューお願いします。 レビュアー: <@${firstReviewer}>, <@${secondReviewer}>!`, thread_ts: message.ts });
	} catch (err) {
		await say({text: `エラーが発生しました。: ${err}`, thread_ts: message.ts})
	}
});

async function isActive(selectReviewer) {
  let result = await app.client.users.getPresence({
    user: selectReviewer
  });
  return result.presence == 'active'
}

async function selectReviewer(selectReviewers) {
  let reviewer = 'undefined'
  let count = selectReviewers.length
  for (let i = 0; i < count; i++) {
    let num = Math.floor(Math.random() * selectReviewers.length)
    let tmpReviewer = selectReviewers[num]
    selectReviewers.splice(num, 1)
    if (await isActive(tmpReviewer)) {
      reviewer = tmpReviewer
      break
    }
  }
  return reviewer
}

module.exports.handler = async (event, context, callback) => {
	// Slackのurl_verification（URL検証）イベントを処理
  const body = JSON.parse(event.body || '{}');

  if (body.type === 'url_verification') {
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: body.challenge })
    };
  }

  // 通常のレスポンスを先に返す
  callback(null, {statusCode: 200, body: JSON.stringify({ok:"ok"})});

  // リトライリクエストは無視
  if(event.headers["X-Slack-Retry-Num"]){
    console.log("リトライのため終了");
    console.log(event);
    return;
  }

  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
}

