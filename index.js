const { App, AwsLambdaReceiver } = require('@slack/bolt')

const aistudioReviewer = [
  { id: 'U04AKQ3962G', weight: 1 }, // jima
  { id: 'U087G18N284', weight: 1 }, // しのたつさん
  { id: 'U082X9USNCU', weight: 1 }, // ごろーさん
  { id: 'UN9S3A0VD', weight: 0.5 }, // おかぴさん
  { id: 'U08K4F0JADS', weight: 1 }, // はじめちゃん
  { id: 'U08LAC91Z6K', weight: 1 }, // やぎさん
]

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
})

app.message('レビュー', async ({ message, say }) => {
  try {
    if (message.text.indexOf('https://github.com/') == -1) return

    let currentHour = new Date(
      Date.now() + (new Date().getTimezoneOffset() + 9 * 60) * 60 * 1000
    ).getHours()

    if (!(currentHour > 6 && currentHour < 19)) return

    let reviewers = aistudioReviewer.concat()
    let messageUserIndex = reviewers.findIndex(
      (reviewer) => reviewer.id === message.user
    )
    if (messageUserIndex !== -1) {
      reviewers.splice(messageUserIndex, 1)
    }
    const firstReviewer = await selectReviewer(reviewers)

    const firstReviewerIndex = reviewers.findIndex(
      (reviewer) => reviewer.id === firstReviewer
    )
    if (firstReviewerIndex !== -1) {
      reviewers.splice(firstReviewerIndex, 1)
    }
    const secondReviewer = await selectReviewer(reviewers)

    await say({
      text: `レビューお願いします。 レビュアー: <@${firstReviewer}>, <@${secondReviewer}>`,
      thread_ts: message.ts,
    })
  } catch (err) {
    await say({
      text: `エラーが発生しました。: ${err}`,
      thread_ts: message.ts,
    })
  }
})

async function isActive(reviewerId) {
  let result = await app.client.users.getPresence({
    user: reviewerId,
  })
  return result.presence == 'active'
}

async function selectReviewer(selectReviewers) {
  let reviewer = 'undefined'
  // reviewers配列の各要素のweightを合計
  const totalWeight = selectReviewers.reduce(
    (sum, reviewer) => sum + reviewer.weight,
    0
  )

  // reviewersのコピーを作成（元の配列を変更しないため）
  const reviewersCopy = [...selectReviewers]

  // すべてのレビュアーを試す
  for (let i = 0; i < reviewersCopy.length; i++) {
    // 0～totalWeightの間のランダムな値を生成
    const randomValue = Math.random() * totalWeight

    // 重みに基づいて累積値を計算し、ランダム値と比較
    let cumulativeWeight = 0
    for (let j = 0; j < reviewersCopy.length; j++) {
      cumulativeWeight += reviewersCopy[j].weight
      if (randomValue <= cumulativeWeight) {
        const selectedReviewer = reviewersCopy[j]
        // 選択されたレビュアーを配列から削除
        reviewersCopy.splice(j, 1)

        // アクティブなら選択、そうでなければ次のループへ
        if (await isActive(selectedReviewer.id)) {
          reviewer = selectedReviewer.id
          break
        }
        break
      }
    }

    if (reviewer !== 'undefined') break
  }

  return reviewer
}

module.exports.handler = async (event, context, callback) => {
  // Slackのurl_verification（URL検証）イベントを処理
  const body = JSON.parse(event.body || '{}')

  if (body.type === 'url_verification') {
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: body.challenge }),
    }
  }

  // 通常のレスポンスを先に返す
  callback(null, { statusCode: 200, body: JSON.stringify({ ok: 'ok' }) })

  // リトライリクエストは無視
  if (event.headers['X-Slack-Retry-Num']) {
    console.log('リトライのため終了')
    console.log(event)
    return
  }

  const handler = await awsLambdaReceiver.start()
  return handler(event, context, callback)
}
