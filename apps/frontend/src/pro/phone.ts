/** Optional verification slot. A UI callback never assigns a verified timestamp. */
export interface PhoneVerificationProps {mode:'signup'|'profile';email?:string;emailProof?:string;country:string;phone:string;verified?:boolean;disabled?:boolean;onBusy:(value:boolean)=>void;onSuccess:(intentId:string)=>void|Promise<void>}
