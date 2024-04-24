// import { HttpResponse, http } from "msw";
// import { InterceptParams } from "./msw";

// //TODO: how do we handle feature/key in the URL???????

// export const handleMockGet = (params?: InterceptParams) =>
//   http.get("https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/{feature}/{key}", async (ctx) => {
//     if (params?.inspect) await params.inspect(ctx);
//     if (params?.callback) return await params.callback(ctx);
//     return HttpResponse.json({
//         HashedKey: "8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2",
//         Data: "{\"v\":\"1\",\"d\":\"lFe1XrQHvvnhLx9EsqSgayI8tOC/wC8oDccXA/l9xqzVs7m6TkNdpNTDB4rW58hX6OrhrjCMlFDTtg1GDfgEUA==\",\"iterations\":900000}"
//     });
//   });

// export const handleMockPut = (params?: InterceptParams) =>
//   http.post("https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/{feature}/{key}", async (ctx) => {
//     if (params?.inspect) await params.inspect(ctx);
//     if (params?.callback) return await params.callback(ctx);
//     return HttpResponse.json({});
//   });
