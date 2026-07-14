const fetch = require('node-fetch');

async function checkUser() {
  const query = `
    query {
      User(name: "Captainzura") {
        id
        statistics {
          manga {
            count
            chaptersRead
          }
        }
      }
    }
  `;
  
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const json = await res.json();
  console.log("User Data:", JSON.stringify(json, null, 2));

  if (json.data && json.data.User) {
    const userId = json.data.User.id;
    const listQuery = `
      query ($userId: Int) {
        MediaListCollection(userId: $userId, type: MANGA) {
          lists {
            name
            entries {
              id
            }
          }
        }
      }
    `;
    const res2 = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: listQuery, variables: { userId } })
    });
    const json2 = await res2.json();
    console.log("Manga Lists:", JSON.stringify(json2, null, 2));
  }
}

checkUser();
