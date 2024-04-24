import { HttpResponse, http } from "msw";
import { InterceptParams } from "./msw";

export const handleMockUserStorageGet = (params?: InterceptParams) =>
  http.get("https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/notifications/006924262004cea603c25922bbebdf506ab29f76f7f5f1bb7f0254ca8e9a02c8", async (ctx) => {
    if (params?.inspect) await params.inspect(ctx);
    if (params?.callback) return await params.callback(ctx);
    return HttpResponse.json({
        HashedKey: "8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2",
        Data: "{\"v\":\"1\",\"d\":\"lFe1XrQHvvnhLx9EsqSgayI8tOC/wC8oDccXA/l9xqzVs7m6TkNdpNTDB4rW58hX6OrhrjCMlFDTtg1GDfgEUA==\",\"iterations\":900000}"
    });
  });

export const handleMockUserStoragePut = (params?: InterceptParams) =>
  http.put("https://user-storage.dev-api.cx.metamask.io/api/v1/userstorage/notifications/006924262004cea603c25922bbebdf506ab29f76f7f5f1bb7f0254ca8e9a02c8", async (ctx) => {
    if (params?.inspect) await params.inspect(ctx); 
    if (params?.callback) return await params.callback(ctx);
    return HttpResponse.json({});
  });
