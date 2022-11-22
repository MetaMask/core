import 'isomorphic-fetch';
import { TextDecoder } from 'util';

// not sure why this is a type mismatch and has to be type cast to any...?
global.TextDecoder = TextDecoder as any;