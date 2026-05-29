# Cloudflare Migration Checklist

このメモは、次の作業で Cloudflare D1 / R2 に載せ替えるための確認リストです。

## 今回は対象外

- AI提案、AIアドバイスの本実装
- 共有メンバー管理の本実装

## D1 に寄せるデータ

- events
- moneyRecords
- loveLogs
- tags
- partTimeJobs
- creditCards
- dailyPhotos metadata

`src/repositories/calendarRepository.ts` を境界にして、最初は localStorage 実装、次に D1 実装へ差し替える。

## R2 に寄せるデータ

- daily photo originals
- daily photo optimized images

`src/storage/storageService.ts` を境界にして、UI から R2 を直接触らない。

## 画像データの次の変更

現在の `DailyPhoto.imageUrl` はブラウザ内の data URL を持てる形。
D1 / R2 版では、DB には `imageKey` と metadata を保存し、表示URLは storage layer で生成する。

推奨キー:

```txt
daily-images/originals/{calendarId}/{date}/{photoId}
daily-images/optimized/{calendarId}/{date}/{photoId}.webp
```

## 次に実装する順番

1. localStorage の読み書きを repository 実装へ寄せる
2. 画像保存を storage service 経由へ寄せる
3. Workers API の route を作る
4. D1 schema を作る
5. R2 upload / public URL generation を作る
6. 共有カレンダー用の `calendarId` を全データ操作に通す
